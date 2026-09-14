"""Run with TEST_MEAT_ADMIN_URL pointing to an isolated PostgreSQL 16 cluster.

Creates randomly named test databases and drops only those databases afterwards.
No production database or Docker volume is used.
"""
import asyncio
import copy
import io
import os
import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace

import asyncpg
import httpx
import pytest
import pytest_asyncio
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://localhost/unused_meat_test")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("PRODUCTION_HELPER_DATA_DIR", str(Path(tempfile.gettempdir()) / "haccp-meat-test-helper"))

from app.main import app
import app.main as main
from app.core.database import get_db
from app.dependencies.auth import get_current_active_user
from app.models.enums import UserRole
from app.schemas.meat_processing import MeatSave, MeatStepData

ROOT = Path(__file__).resolve().parents[2]
SIGN = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="


def test_schema_rejects_precision_and_invalid_step_times():
    with pytest.raises(ValidationError):
        MeatSave(version=0, inputs=[dict(inv_item_id=1, supplier="s", source_batch="a", weight_kg="1.0001")])
    with pytest.raises(ValidationError):
        MeatStepData(kind="trim", operator="A", start_time="2026-09-15T10:00:00Z", end_time="2026-09-15T09:00:00Z")
    with pytest.raises(ValidationError):
        MeatStepData(kind="thaw", operator="A", temperature_c="4")


def test_migration_copies_match():
    sql = (ROOT / "backend/app/core/meat_processing.sql").read_text(encoding="utf-8")
    assert (ROOT / "database/migrations/20260915_meat_processing.sql").read_text(encoding="utf-8") == sql
    assert (ROOT / "database/init.sql").read_text(encoding="utf-8").endswith(sql)


@pytest.fixture(scope="session")
def template_database():
    admin_url = os.environ.get("TEST_MEAT_ADMIN_URL")
    if not admin_url:
        pytest.skip("Set TEST_MEAT_ADMIN_URL for isolated PostgreSQL integration tests")
    name = "meat_template_" + uuid.uuid4().hex[:12]
    prefix = admin_url.rsplit("/", 1)[0]

    async def prepare():
        admin = await asyncpg.connect(admin_url)
        await admin.execute(f'CREATE DATABASE "{name}"')
        await admin.close()
        conn = await asyncpg.connect(prefix + "/" + name)
        # Simulate an existing installation before this feature, including orphan batch codes.
        sql = (ROOT / "database/init.sql").read_text(encoding="utf-8").split("-- Meat processing (2026-09-15)")[0]
        await conn.execute(sql)
        await conn.execute("""
            INSERT INTO prod_products(code,name,product_type) VALUES ('LEGACY-F','Legacy forming','forming'),('LEGACY-H','Legacy hot','hot_process');
            INSERT INTO prod_batches(batch_code,product_code,product_name,production_date,spec_piece_weight_g)
            VALUES ('legacy-forming','LEGACY-F','Legacy forming','2026-09-01',17.5),
                   ('legacy-hot','LEGACY-H','Legacy hot','2026-09-01',0),
                   ('legacy-orphan','MISSING','Unknown legacy','2026-09-01',0);
        """)
        await conn.close()
        engine = create_async_engine((prefix + "/" + name).replace("postgresql://", "postgresql+asyncpg://"))
        original = main.engine
        main.engine = engine
        try:
            for _ in range(2):
                async with main.lifespan(app):
                    pass
        finally:
            main.engine = original
            await engine.dispose()
        conn = await asyncpg.connect(prefix + "/" + name)
        rows = await conn.fetch("SELECT batch_code,process_type FROM prod_batches ORDER BY batch_code")
        types = {r["batch_code"]: r["process_type"] for r in rows}
        assert types["legacy-forming"] == "forming" and types["legacy-hot"] == "hot_process"
        assert types["legacy-orphan"] is None
        assert await conn.fetchval("SELECT count(*) FROM prod_batch_type_migration_review") == 1
        for role in ("Admin", "Production", "QA", "Warehouse", "Captain"):
            await conn.execute("INSERT INTO users(username,full_name,password_hash,role,is_active) VALUES ($1,$1,'unused',$2,true)", "test-" + role, role)
        await conn.close()

    asyncio.run(prepare())
    yield admin_url, prefix, name

    async def cleanup():
        conn = await asyncpg.connect(admin_url)
        await conn.execute(f'DROP DATABASE "{name}"')
        await conn.close()
    asyncio.run(cleanup())


@pytest_asyncio.fixture
async def env(template_database):
    admin_url, prefix, template = template_database
    name = "meat_test_" + uuid.uuid4().hex[:12]
    admin = await asyncpg.connect(admin_url)
    await admin.execute(f'CREATE DATABASE "{name}" TEMPLATE "{template}"')
    await admin.close()
    engine = create_async_engine((prefix + "/" + name).replace("postgresql://", "postgresql+asyncpg://"))
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    async with factory() as session:
        users = (await session.execute(text("SELECT id,role FROM users WHERE username LIKE 'test-%'"))).all()
    ids = {row.role: row.id for row in users}
    current = {"role": "Admin"}

    async def db_override():
        async with factory() as session:
            yield session

    async def user_override():
        role = current["role"]
        return SimpleNamespace(id=ids[role], role=UserRole(role), full_name="Test " + role, is_active=True)

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_active_user] = user_override
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        state = SimpleNamespace(client=client, factory=factory, role=current, ids=ids)
        try:
            yield state
        finally:
            app.dependency_overrides.clear()
    await engine.dispose()
    admin = await asyncpg.connect(admin_url)
    await admin.execute(f'DROP DATABASE "{name}"')
    await admin.close()


async def request(env, method, path, data=None, expected=200):
    r = await env.client.request(method, "/api/v1" + path, json=data)
    assert r.status_code == expected, r.text
    return r.json() if r.content else None


async def setup_batch(env, code="MEAT"):
    product = await request(env, "POST", "/production/products", dict(code=code, name="Meat prep", product_type="meat_processing"), 201)
    batch = await request(env, "POST", "/production/batches", dict(product_code=code, product_name="client untrusted", production_date="2026-09-15", operator_signature_data_url=SIGN), 201)
    assert batch["process_type"] == "meat_processing" and batch["product_name"] == "Meat prep"
    async with env.factory() as db:
        loc1 = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('MEAT-A','A') RETURNING id"))
        loc2 = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('MEAT-B','B') RETURNING id"))
        raw = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('RAW-M','Pork','raw','kg') RETURNING id"))
        marinade = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('MAR-M','Marinade','raw','kg') RETURNING id"))
        out = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('OUT-M','Sliced pork','intermediate','kg') RETURNING id"))
        byproduct = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('BY-M','Trim for mince','intermediate','kg') RETURNING id"))
        bad = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('BAG-M','Bag product','finished','包') RETURNING id"))
        for item in (out, byproduct, bad):
            for loc in (loc1, loc2):
                await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=item,l=loc))
        await db.commit()
    data = dict(version=0, difference_reason="", inputs=[
        dict(inv_item_id=raw, supplier="Farm", source_batch="RAW-001", weight_kg="100.000"),
        dict(inv_item_id=marinade, supplier="Kitchen", source_batch="MAR-001", weight_kg="10.000"),
    ], steps=[dict(kind="slice", operator="Operator", start_time="2026-09-15T00:00:00Z", end_time="2026-09-15T01:00:00Z", temperature_c="4.20", measured_at="2026-09-15T00:30:00Z")], outputs=[
        dict(inv_item_id=out, weight_kg="60.000", location_id=loc1),
        dict(inv_item_id=out, weight_kg="20.000", location_id=loc1),
        dict(inv_item_id=out, weight_kg="20.000", location_id=loc2),
        dict(inv_item_id=byproduct, weight_kg="5.000", location_id=loc2),
    ], losses=[dict(kind="discard", weight_kg="5.000", notes="Unusable trim")])
    return SimpleNamespace(id=batch["id"], product=product, data=data, loc1=loc1, loc2=loc2, raw=raw, out=out, byproduct=byproduct, bad=bad)


async def verified(env, b):
    base = f"/production/batches/{b.id}/meat"
    env.role["role"] = "Production"
    record = await request(env, "PUT", base, b.data)
    await request(env, "POST", base + "/complete", dict(version=1,operator_signature_data_url=SIGN))
    env.role["role"] = "QA"
    await request(env, "POST", base + "/verify", dict(version=1,verifier_signature_data_url=SIGN))
    return record


@pytest.mark.asyncio
async def test_full_flow_revision_stock_void_and_snapshot(env):
    b = await setup_batch(env)
    base = f"/production/batches/{b.id}/meat"
    record = await verified(env, b)
    assert record["totals"] == dict(input_kg="110.000",output_kg="105.000",loss_kg="5.000",difference_kg="0.000",yield_pct="95.45")
    env.role["role"] = "Warehouse"
    await request(env, "POST", base + "/enter-stock", dict(version=1))
    batch = await request(env, "GET", f"/production/batches/{b.id}")
    doc_id = batch["inv_stock_doc_id"]
    async with env.factory() as db:
        lines = (await db.execute(text("SELECT item_id,location_id,quantity,unit FROM inv_stock_lines WHERE doc_id=:d ORDER BY item_id,location_id"),dict(d=doc_id))).all()
        assert len(lines) == 3
        assert all(x.unit == "kg" for x in lines)
        assert {(x.item_id,x.location_id): str(x.quantity) for x in lines} == {(b.out,b.loc1):"80.000",(b.out,b.loc2):"20.000",(b.byproduct,b.loc2):"5.000"}
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_movements WHERE item_id=:i"),dict(i=b.raw)) == 0
    env.role["role"] = "Admin"
    await request(env, "PATCH", f'/production/products/{b.product["id"]}', dict(product_type="hot_process"))
    listing = await request(env, "GET", "/production/batches?product_type=meat_processing&meat_state=stocked")
    assert any(x["id"] == b.id for x in listing["items"])
    await request(env, "POST", f"/inventory/docs/{doc_id}/void", dict(void_reason="wrong output"), 409)
    await request(env, "POST", f"/production/batches/{b.id}/void",dict(void_reason="Wrong batch data"))
    async with env.factory() as db:
        assert await db.scalar(text("SELECT sum(quantity) FROM inv_stock_balance WHERE item_id IN (:i,:j)"),dict(i=b.out,j=b.byproduct)) == 0
        assert await db.scalar(text("SELECT count(*) FROM audit_log WHERE table_name='prod_meat_records'")) == 5
    history = await request(env, "GET", base + "/history")
    assert history[0]["inputs"][0]["source_batch"] == "RAW-001"
    await request(env, "POST", base + "/enter-stock", dict(version=1),409)


@pytest.mark.asyncio
async def test_revision_history_stale_save_difference_and_signatures(env):
    b = await setup_batch(env); base = f"/production/batches/{b.id}/meat"
    b.data["outputs"][0]["weight_kg"] = "61.000"
    await request(env,"PUT",base,b.data)
    await request(env,"PUT",base,b.data,409)
    await request(env,"POST",base+"/complete",dict(version=1),422)
    await request(env,"POST",base+"/complete",dict(version=1,operator_signature_data_url=SIGN),422)
    b.data.update(version=1,difference_reason="Measured yield difference")
    await request(env,"PUT",base,b.data)
    await request(env,"POST",base+"/complete",dict(version=2,operator_signature_data_url=SIGN))
    # Editing submitted data creates a fresh unsigned draft.
    b.data.update(version=2,difference_reason="Updated explanation")
    fresh = await request(env,"PUT",base,b.data)
    assert fresh["state"] == "draft" and fresh["operator_signature_data_url"] is None
    history = await request(env,"GET",base+"/history")
    assert [x["version"] for x in history] == [3,2,1]
    assert history[1]["state"] == "submitted"
    await request(env,"POST",base+"/verify",dict(version=2,verifier_signature_data_url=SIGN),409)


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["unit", "location", "receipt", "pack", "zero", "precision", "end", "temperature"])
async def test_validation(env, case):
    b=await setup_batch(env); data=copy.deepcopy(b.data)
    if case=="unit": data["outputs"][0]["inv_item_id"]=b.bad
    if case=="location": data["outputs"][0]["location_id"]=999999
    if case=="receipt": data["inputs"][0]["receiving_log_id"]=999999
    if case=="pack": data["outputs"][0]["pack_type"]="NONEXISTENT"
    if case=="zero": data["outputs"][0]["weight_kg"]="0"
    if case=="precision": data["outputs"][0]["weight_kg"]="1.0001"
    if case=="end": data["steps"][0]["end_time"]="2026-09-14T00:00:00Z"
    if case=="temperature": data["steps"][0]["measured_at"]=None
    await request(env,"PUT",f"/production/batches/{b.id}/meat",data,422)


@pytest.mark.asyncio
async def test_permissions_lock_and_legacy_bypass(env):
    b=await setup_batch(env); base=f"/production/batches/{b.id}"
    await request(env, "PATCH", "/production/batches/not-an-id", {}, 422)
    env.role["role"]="Warehouse"
    await request(env,"PUT",base+"/meat",b.data,403)
    env.role["role"]="Production"
    await request(env,"PUT",base+"/meat",b.data)
    await request(env,"POST",base+"/meat/enter-stock",dict(version=1),409)
    await request(env,"POST",base+"/meat/complete",dict(version=1,operator_signature_data_url=SIGN))
    await request(env,"POST",base+"/meat/verify",dict(version=1,verifier_signature_data_url=SIGN),403)
    env.role["role"]="QA"
    await request(env,"POST",base+"/meat/verify",dict(version=1),422)
    await request(env,"POST",base+"/meat/verify",dict(version=1,verifier_signature_data_url=SIGN))
    env.role["role"]="Admin"
    b.data["version"]=1
    await request(env,"PUT",base+"/meat",b.data,409)
    for path,method,data in [('/packing','POST',{}),('/hot-inputs','POST',{}),('/trolleys','POST',{}),('/batch-sheet','POST',{}),('','PATCH',dict(operator="hacked")),('/enter-stock','POST',dict(location_id=b.loc1))]:
        await request(env,method,base+path,data,409)
    async with env.factory() as db:
        with pytest.raises(Exception, match="append-only"):
            await db.execute(text("UPDATE prod_meat_outputs SET weight_kg=1"))
        await db.rollback()
        with pytest.raises(Exception, match="immutable"):
            await db.execute(text("UPDATE prod_batches SET product_name='hacked' WHERE id=:b"),dict(b=b.id))
        await db.rollback()


@pytest.mark.asyncio
async def test_concurrent_save_and_stock_are_single_write(env):
    b=await setup_batch(env); base=f"/api/v1/production/batches/{b.id}/meat"
    responses=await asyncio.gather(*[env.client.put(base,json=b.data) for _ in range(2)])
    assert sorted(r.status_code for r in responses)==[200,409]
    await request(env,"POST",base.removeprefix('/api/v1')+"/complete",dict(version=1,operator_signature_data_url=SIGN))
    await request(env,"POST",base.removeprefix('/api/v1')+"/verify",dict(version=1,verifier_signature_data_url=SIGN))
    responses=await asyncio.gather(*[env.client.post(base+"/enter-stock",json=dict(version=1)) for _ in range(2)])
    assert sorted(r.status_code for r in responses)==[200,409]
    async with env.factory() as db:
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_docs WHERE doc_number=:n"),dict(n=f"IN-MEAT-{b.id}"))==1


@pytest.mark.asyncio
async def test_stock_failure_rolls_back_and_captain_can_complete(env):
    b=await setup_batch(env); await verified(env,b)
    async with env.factory() as db:
        await db.execute(text("UPDATE inv_items SET base_unit='包' WHERE id=:i"),dict(i=b.out)); await db.commit()
    env.role["role"]="Captain"
    await request(env,"POST",f"/production/batches/{b.id}/meat/enter-stock",dict(version=1),422)
    async with env.factory() as db:
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_docs WHERE doc_number=:n"),dict(n=f"IN-MEAT-{b.id}"))==0
        await db.execute(text("UPDATE inv_items SET base_unit='kg' WHERE id=:i"),dict(i=b.out)); await db.commit()
    await request(env,"POST",f"/production/batches/{b.id}/meat/enter-stock",dict(version=1))


@pytest.mark.asyncio
async def test_posting_failure_rolls_back_lines_movements_and_state(env, monkeypatch):
    from app.services import inventory_service
    b = await setup_batch(env)
    await verified(env, b)
    env.role["role"] = "Admin"
    original = inventory_service.post_document

    async def fail_after_post(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("Simulated failure after stock posting")

    monkeypatch.setattr(inventory_service, "post_document", fail_after_post)
    with pytest.raises(RuntimeError, match="Simulated failure"):
        await env.client.post(f"/api/v1/production/batches/{b.id}/meat/enter-stock", json=dict(version=1))
    async with env.factory() as db:
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_docs WHERE doc_number=:n"), dict(n=f"IN-MEAT-{b.id}")) == 0
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_movements WHERE item_id=:i"), dict(i=b.out)) == 0
        assert await db.scalar(text("SELECT inv_stock_doc_id FROM prod_batches WHERE id=:b"), dict(b=b.id)) is None
        assert await db.scalar(text("SELECT state FROM prod_meat_records WHERE batch_id=:b"), dict(b=b.id)) == "verified"


@pytest.mark.asyncio
async def test_two_batches_posting_same_item_preserve_both_increments(env):
    b = await setup_batch(env)
    await verified(env, b)
    env.role["role"] = "Admin"
    second = await request(env, "POST", "/production/batches", dict(product_code="MEAT", product_name="Meat prep", production_date="2026-09-15", operator_signature_data_url=SIGN), 201)
    other = SimpleNamespace(id=second["id"], data=copy.deepcopy(b.data))
    await verified(env, other)
    env.role["role"] = "Warehouse"
    responses = await asyncio.gather(*[
        env.client.post(f"/api/v1/production/batches/{bid}/meat/enter-stock", json=dict(version=1)) for bid in (b.id, other.id)
    ])
    assert [r.status_code for r in responses] == [200, 200], [r.text for r in responses]
    async with env.factory() as db:
        assert await db.scalar(text("SELECT quantity FROM inv_stock_balance WHERE item_id=:i AND location_id=:l"), dict(i=b.out,l=b.loc1)) == 160


@pytest.mark.asyncio
async def test_legacy_packing_and_pack_applicability(env):
    # Existing package-count workflows and the meaning of 'both' are unchanged.
    for kind in ("forming","hot_process"):
        await request(env,"POST","/production/pack-types",dict(code="BOTH-"+kind,name="Both",applicable_type="both"),201)
        batch=await request(env,"POST","/production/batches",dict(product_code="LEGACY-F" if kind=="forming" else "LEGACY-H",product_name="Old",production_date="2026-09-15",operator_signature_data_url=SIGN),201)
        async with env.factory() as db:
            loc=await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES (:c,'L') RETURNING id"),dict(c=kind))
            item=await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES (:c,'Bags','finished','包') RETURNING id"),dict(c=kind))
            await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"),dict(i=item,l=loc));await db.commit()
        await request(env,"POST",f'/production/batches/{batch["id"]}/packing',dict(records=[dict(pack_type="BOTH-"+kind,inv_item_id=item,bag_count=5,nominal_weight_kg="2")],trims=[],operator_signature_data_url=SIGN))
        await request(env,"POST",f'/production/batches/{batch["id"]}/enter-stock',dict(location_id=loc))
        async with env.factory() as db:
            assert await db.scalar(text("SELECT quantity FROM inv_stock_balance WHERE item_id=:i"),dict(i=item))==5
    meat_packs=await request(env,"GET","/production/pack-types?applicable_type=meat_processing")
    assert not any(x["applicable_type"]=="both" for x in meat_packs)


@pytest.mark.asyncio
async def test_product_import_meat(env):
    from openpyxl import Workbook
    workbook=Workbook();sheet=workbook.active
    sheet.append(["code","name","type"]);sheet.append(["instructions"])
    sheet.append(["IMPORT-M","Imported meat","meat_processing"])
    buf=io.BytesIO();workbook.save(buf)
    r=await env.client.post('/api/v1/production/products/import',files={'file':('products.xlsx',buf.getvalue(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert r.status_code==200,r.text
    assert r.json()['created']==1,r.text
    products=await request(env,"GET","/production/products?search=IMPORT-M")
    assert products['items'][0]['product_type']=='meat_processing'
