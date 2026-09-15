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
from datetime import date
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
from app.schemas.meat_processing import MeatSave, MeatStepData, MeatLabelRequest
from app.services.production_labels import build_meat_label_html
from app.services.inventory_service import validate_document_scope
from fastapi import HTTPException

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
    meat_sql = (ROOT / "backend/app/core/meat_processing.sql").read_text(encoding="utf-8")
    lot_sql = (ROOT / "backend/app/core/inventory_lots.sql").read_text(encoding="utf-8")
    init_sql = (ROOT / "database/init.sql").read_text(encoding="utf-8")
    assert (ROOT / "database/migrations/20260915_meat_processing.sql").read_text(encoding="utf-8") == meat_sql
    assert (ROOT / "database/migrations/20260915_inventory_lots.sql").read_text(encoding="utf-8") == lot_sql
    assert meat_sql in init_sql
    assert init_sql.endswith(lot_sql)


@pytest.mark.parametrize("direction,scope,valid", [
    (direction, scope, direction == "IN" or scope in (None, "intermediate", "finished"))
    for direction in ("IN", "OUT")
    for scope in (None, "raw", "packaging", "intermediate", "finished")
])
def test_document_scope_matrix(direction, scope, valid):
    if valid:
        validate_document_scope(direction, scope)
    else:
        with pytest.raises(HTTPException) as error:
            validate_document_scope(direction, scope)
        assert error.value.status_code == 422


def test_document_scope_classification_and_dual_use():
    for primary in ("raw", "packaging", "intermediate", "finished"):
        item = SimpleNamespace(code="TEST", item_type=primary, meat_output_type=None)
        validate_document_scope("IN", None, item)
        validate_document_scope("IN", primary, item)
        for scope in ("raw", "packaging", "intermediate", "finished"):
            if scope != primary:
                with pytest.raises(HTTPException) as error:
                    validate_document_scope("IN", scope, item)
                assert error.value.status_code == 422
    for output in ("intermediate", "finished"):
        item = SimpleNamespace(code="DUAL", item_type="raw", meat_output_type=output)
        validate_document_scope("IN", "raw", item)
        validate_document_scope("OUT", output, item)


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
        await conn.execute("ALTER TABLE inv_stock_docs DROP COLUMN item_type_scope")
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
        assert await conn.fetchval("SELECT count(*) FROM information_schema.columns WHERE table_name='inv_stock_docs' AND column_name='item_type_scope'") == 1
        assert await conn.fetchval("SELECT to_regclass('ix_inv_stock_docs_item_type_scope')") is not None
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


@pytest.mark.asyncio
async def test_scoped_stock_docs_create_edit_filter_post_and_legacy(env):
    async with env.factory() as db:
        loc = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('SCOPE-A','Scope A') RETURNING id"))
        ids = {}
        for code, primary, output in (("SCOPE-RAW", "raw", None), ("SCOPE-FIN", "finished", None), ("SCOPE-DUAL", "raw", "finished")):
            ids[code] = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,meat_output_type,base_unit) VALUES (:code,:code,:primary,:output,'KG') RETURNING id"), dict(code=code, primary=primary, output=output))
            await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=ids[code], l=loc))
        await db.commit()

    def line(code):
        return dict(item_id=ids[code], location_id=loc, quantity="1.000", unit="KG")

    raw_line, fin_line, dual_line = [line(code) for code in ids]
    for direction, scope, lines in (("IN", "raw", [fin_line]), ("OUT", "raw", [raw_line]), ("OUT", "packaging", [raw_line]), ("IN", "bogus", [raw_line])):
        await request(env, "POST", "/inventory/docs", dict(doc_type=direction, item_type_scope=scope, lines=lines), 422)

    general = await request(env, "POST", "/inventory/docs", dict(doc_type="IN", lines=[raw_line, fin_line, dual_line]), 201)
    assert general["item_type_scope"] is None
    await request(env, "POST", f'/inventory/docs/{general["id"]}/post')
    raw_doc = await request(env, "POST", "/inventory/docs", dict(doc_type="IN", item_type_scope="raw", lines=[raw_line]), 201)
    out_doc = await request(env, "POST", "/inventory/docs", dict(doc_type="OUT", item_type_scope="finished", lines=[fin_line, dual_line]), 201)
    assert out_doc["item_type_scope"] == "finished"
    await request(env, "PATCH", f'/inventory/docs/{raw_doc["id"]}', dict(lines=[fin_line]), 422)
    unchanged = await request(env, "GET", f'/inventory/docs/{raw_doc["id"]}')
    assert unchanged["lines"][0]["item_id"] == raw_line["item_id"]
    updated = await request(env, "PATCH", f'/inventory/docs/{raw_doc["id"]}', dict(item_type_scope="finished", lines=[fin_line]))
    assert updated["item_type_scope"] == "finished"
    updated = await request(env, "PATCH", f'/inventory/docs/{raw_doc["id"]}', dict(item_type_scope=None, lines=[raw_line, fin_line]))
    assert updated["item_type_scope"] is None
    await request(env, "PATCH", f'/inventory/docs/{out_doc["id"]}', dict(item_type_scope="raw", lines=[raw_line]), 422)

    filtered = await request(env, "GET", "/inventory/docs?doc_type=OUT&item_type_scope=finished&status=Draft")
    assert filtered["total"] == 1 and filtered["items"][0]["id"] == out_doc["id"]
    general_filtered = await request(env, "GET", "/inventory/docs?doc_type=IN&general_only=true")
    assert general_filtered["total"] == 2 and all(d["item_type_scope"] is None for d in general_filtered["items"])
    precedence = await request(env, "GET", "/inventory/docs?doc_type=IN&general_only=true&item_type_scope=finished")
    assert precedence["total"] == 2

    async with env.factory() as db:
        await db.execute(text("UPDATE inv_stock_docs SET item_type_scope='raw' WHERE id=:id"), dict(id=out_doc["id"]))
        await db.commit()
    await request(env, "POST", f'/inventory/docs/{out_doc["id"]}/post', expected=422)
    async with env.factory() as db:
        await db.execute(text("UPDATE inv_stock_docs SET item_type_scope='finished' WHERE id=:id"), dict(id=out_doc["id"]))
        await db.commit()

    async with env.factory() as db:
        await db.execute(text("UPDATE inv_items SET item_type='raw' WHERE id=:id"), dict(id=fin_line["item_id"]))
        await db.commit()
    await request(env, "POST", f'/inventory/docs/{out_doc["id"]}/post', expected=422)
    async with env.factory() as db:
        await db.execute(text("UPDATE inv_items SET item_type='finished' WHERE id=:id"), dict(id=fin_line["item_id"]))
        await db.commit()
    await request(env, "POST", f'/inventory/docs/{out_doc["id"]}/post')
    await request(env, "POST", f'/inventory/docs/{raw_doc["id"]}/post')
    await request(env, "PATCH", f'/inventory/docs/{out_doc["id"]}', dict(lines=[fin_line]), 400)


async def setup_batch(env, code="MEAT"):
    product = await request(env, "POST", "/production/products", dict(code=code, name="Meat prep", product_type="meat_processing"), 201)
    batch = await request(env, "POST", "/production/batches", dict(process_type="meat_processing", product_code=code, product_name="client untrusted", production_date="2026-09-15", operator_signature_data_url=SIGN), 201)
    assert batch["process_type"] == "meat_processing" and batch["product_name"] == "Meat prep"
    async with env.factory() as db:
        loc1 = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('MEAT-A','A') RETURNING id"))
        loc2 = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('MEAT-B','B') RETURNING id"))
        raw = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit,lot_tracking_enabled) VALUES ('RAW-M','Pork','raw','kg',true) RETURNING id"))
        marinade = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('MAR-M','Marinade','raw','kg') RETURNING id"))
        out = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('OUT-M','Sliced pork','intermediate','kg') RETURNING id"))
        byproduct = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('BY-M','Trim for mince','intermediate','kg') RETURNING id"))
        bad = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('BAG-M','Bag product','finished','包') RETURNING id"))
        for item in (raw, marinade, out, byproduct, bad):
            for loc in (loc1, loc2):
                await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=item,l=loc))
        raw_lot = await db.scalar(text("INSERT INTO inv_lots(item_id,lot_code,origin_type) VALUES (:i,'RAW-LOT-001','manual_adjustment') RETURNING id"), dict(i=raw))
        await db.execute(text("INSERT INTO inv_stock_balance(item_id,location_id,lot_id,quantity) VALUES (:i,:l,:lot,500)"), dict(i=raw,l=loc1,lot=raw_lot))
        await db.execute(text("INSERT INTO inv_stock_balance(item_id,location_id,quantity) VALUES (:i,:l,50)"), dict(i=marinade,l=loc1))
        await db.commit()
    data = dict(version=0, difference_reason="", inputs=[
        dict(inv_item_id=raw, supplier="Farm", source_batch="RAW-001", source_location_id=loc1, source_lot_id=raw_lot, weight_kg="100.000"),
        dict(inv_item_id=marinade, supplier="Kitchen", source_batch="MAR-001", source_location_id=loc1, weight_kg="10.000"),
    ], steps=[dict(kind="slice", operator="Operator", start_time="2026-09-15T00:00:00Z", end_time="2026-09-15T01:00:00Z", temperature_c="4.20", measured_at="2026-09-15T00:30:00Z")], outputs=[
        dict(inv_item_id=out, weight_kg="60.000", location_id=loc1),
        dict(inv_item_id=out, weight_kg="20.000", location_id=loc1),
        dict(inv_item_id=out, weight_kg="20.000", location_id=loc2),
        dict(inv_item_id=byproduct, weight_kg="5.000", location_id=loc2),
    ], losses=[dict(kind="discard", weight_kg="5.000", notes="Unusable trim")])
    return SimpleNamespace(id=batch["id"], product=product, data=data, loc1=loc1, loc2=loc2, raw=raw, raw_lot=raw_lot, marinade=marinade, out=out, byproduct=byproduct, bad=bad)


async def verified(env, b):
    base = f"/production/batches/{b.id}/meat"
    env.role["role"] = "Production"
    record = await request(env, "PUT", base, b.data)
    await request(env, "POST", base + "/complete", dict(version=1,operator_signature_data_url=SIGN))
    env.role["role"] = "QA"
    await request(env, "POST", base + "/verify", dict(version=1,verifier_signature_data_url=SIGN))
    return record


def test_meat_label_layout_uses_measured_weight_and_escapes_names():
    batch = SimpleNamespace(batch_code="MEAT-20260915", production_date=date(2026, 9, 15))
    output = SimpleNamespace(item_name='<script>pork & trim</script>', pack_type='Bag', location_name='A & B')
    data = MeatLabelRequest(version=2, output_index=0, net_weight_kg="3.125", packing_date="2026-09-15")
    label = build_meat_label_html(batch, SimpleNamespace(state="submitted", version=2), output, "PORK-01", data)
    assert 'size: 100mm 75mm' in label and '3.125 kg' in label
    assert '<script>' not in label and '&lt;script&gt;pork &amp; trim&lt;/script&gt;' in label
    assert 'AWAITING QA' in label and 'NOT QA VERIFIED' in label
    assert 'PORK-01' in label and 'Batch barcode MEAT-20260915' in label


@pytest.mark.asyncio
async def test_meat_output_labels_versions_states_and_validation(env, monkeypatch):
    import app.routers.api.v1.meat_processing as labels
    rendered = []
    async def render(label):
        rendered.append(label)
        return b'%PDF-1.4\nlabel-test'
    monkeypatch.setattr(labels, '_render_pdf', render)
    b = await setup_batch(env)
    b.data['outputs'][0]['pack_count'] = 12
    base = f'/production/batches/{b.id}/meat'
    await request(env, 'PUT', base, b.data)
    data = dict(version=1, output_index=0, net_weight_kg='3.125', pack_count=2, packing_date='2026-09-15')
    async def pdf(payload=data, expected=200):
        result = await env.client.post('/api/v1' + base + '/carton-label-pdf', json=payload)
        assert result.status_code == expected, result.text
        if expected == 200:
            assert result.content.startswith(b'%PDF')
            assert result.headers['content-type'] == 'application/pdf'
            assert result.headers['cache-control'] == 'no-store'
        return result
    for role in ('Admin', 'Production', 'QA', 'Warehouse', 'Captain'):
        env.role['role'] = role
        await pdf()
    assert 'Sliced pork' in rendered[-1] and 'IN PROGRESS' in rendered[-1]
    await pdf({**data, 'output_index': 3, 'pack_count': None})
    assert 'Trim for mince' in rendered[-1] and 'BY-M' in rendered[-1]
    for changes in ({'output_index': 4}, {'net_weight_kg': '61.000'}, {'net_weight_kg': '0'},
                    {'net_weight_kg': '1.0001'}, {'pack_count': 13}, {'pack_count': 1.5}, {'packing_date': 'invalid'}):
        await pdf({**data, **changes}, 422)
    env.role['role'] = 'Production'
    b.data['version'] = 1
    await request(env, 'PUT', base, b.data)
    await pdf(expected=409)
    data['version'] = 2
    await request(env, 'POST', base + '/complete', dict(version=2, operator_signature_data_url=SIGN))
    env.role['role'] = 'QA'
    await request(env, 'POST', base + '/verify', dict(version=2, verifier_signature_data_url=SIGN))
    await pdf()
    assert 'QA VERIFIED' in rendered[-1] and 'NOT QA VERIFIED' not in rendered[-1]
    env.role['role'] = 'Warehouse'
    await request(env, 'POST', base + '/enter-stock', dict(version=2))
    await pdf()
    assert 'QA VERIFIED / STOCKED' in rendered[-1]
    record = await request(env, 'GET', base)
    assert record['version'] == 2 and record['state'] == 'stocked'
    user_override = app.dependency_overrides.pop(get_current_active_user)
    try:
        await pdf(expected=401)
    finally:
        app.dependency_overrides[get_current_active_user] = user_override
    env.role['role'] = 'Admin'
    await request(env, 'POST', f'/production/batches/{b.id}/void', dict(void_reason='Rebuild incorrect batch'))
    await pdf(expected=409)


@pytest.mark.asyncio
async def test_legacy_carton_labels_still_render_and_reject_meat_bypass(env, monkeypatch):
    import app.routers.api.v1.production_batches as labels
    rendered = []
    async def render(label):
        rendered.append(label)
        return b'%PDF-1.4\nlegacy-label-test'
    monkeypatch.setattr(labels, '_render_pdf', render)
    async with env.factory() as db:
        legacy = await db.scalar(text("SELECT id FROM prod_batches WHERE batch_code='legacy-forming'"))
    data = dict(bags_per_carton=4, packing_date='2026-09-15', bag_weight_kg='1.5')
    result = await env.client.post(f'/api/v1/production/batches/{legacy}/carton-label-pdf', json=data)
    assert result.status_code == 200 and result.content.startswith(b'%PDF')
    assert 'Legacy forming' in rendered[-1] and '6 kg' in rendered[-1]
    b = await setup_batch(env)
    await request(env, 'POST', f'/production/batches/{b.id}/carton-label-pdf', data, 409)
    await request(env, 'POST', f'/production/batches/{legacy}/meat/carton-label-pdf', dict(version=1, output_index=0, net_weight_kg='1', packing_date='2026-09-15'), 409)


@pytest.mark.asyncio
async def test_batch_creation_filters_and_enforces_product_category(env):
    products = {
        "forming": "TYPE-F",
        "hot_process": "TYPE-H",
        "meat_processing": "TYPE-M",
    }
    for product_type, code in products.items():
        await request(
            env,
            "POST",
            "/production/products",
            dict(code=code, name=f"{product_type} product", product_type=product_type),
            201,
        )

    for product_type, code in products.items():
        options = await request(
            env,
            "GET",
            f"/production/products/forming-options?product_type={product_type}",
        )
        assert code in {option["code"] for option in options}
        assert all(option["product_type"] == product_type for option in options)

    payload = dict(
        process_type="hot_process",
        product_code=products["forming"],
        product_name="ignored",
        production_date="2026-09-15",
        operator_signature_data_url=SIGN,
    )
    await request(env, "POST", "/production/batches", payload, 422)
    payload["product_code"] = products["hot_process"]
    created = await request(env, "POST", "/production/batches", payload, 201)
    assert created["process_type"] == "hot_process"


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
    input_doc_id = batch["input_stock_doc_id"]
    async with env.factory() as db:
        lines = (await db.execute(text("SELECT item_id,location_id,quantity,unit FROM inv_stock_lines WHERE doc_id=:d ORDER BY item_id,location_id"),dict(d=doc_id))).all()
        assert len(lines) == 3
        assert all(x.unit == "kg" for x in lines)
        assert {(x.item_id,x.location_id): str(x.quantity) for x in lines} == {(b.out,b.loc1):"80.000",(b.out,b.loc2):"20.000",(b.byproduct,b.loc2):"5.000"}
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_movements WHERE item_id=:i AND lot_id=:lot"),dict(i=b.raw,lot=b.raw_lot)) == 1
        assert await db.scalar(text("SELECT quantity FROM inv_stock_balance WHERE item_id=:i AND lot_id=:lot"),dict(i=b.raw,lot=b.raw_lot)) == 400
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_lines WHERE doc_id=:d"),dict(d=input_doc_id)) == 2
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
    assert history[0]["inputs"][0]["source_batch"] == "RAW-LOT-001"
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
    if case=="receipt": data["inputs"][1]["receiving_log_id"]=999999
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
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_docs WHERE doc_number=:n"), dict(n=f"OUT-MEAT-{b.id}")) == 0
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_movements WHERE item_id=:i"), dict(i=b.out)) == 0
        assert await db.scalar(text("SELECT inv_stock_doc_id FROM prod_batches WHERE id=:b"), dict(b=b.id)) is None
        assert await db.scalar(text("SELECT state FROM prod_meat_records WHERE batch_id=:b"), dict(b=b.id)) == "verified"


@pytest.mark.asyncio
async def test_two_batches_posting_same_item_preserve_both_increments(env):
    b = await setup_batch(env)
    await verified(env, b)
    env.role["role"] = "Admin"
    second = await request(env, "POST", "/production/batches", dict(process_type="meat_processing", product_code="MEAT", product_name="Meat prep", production_date="2026-09-15", operator_signature_data_url=SIGN), 201)
    other = SimpleNamespace(id=second["id"], data=copy.deepcopy(b.data))
    await verified(env, other)
    env.role["role"] = "Warehouse"
    responses = await asyncio.gather(*[
        env.client.post(f"/api/v1/production/batches/{bid}/meat/enter-stock", json=dict(version=1)) for bid in (b.id, other.id)
    ])
    assert [r.status_code for r in responses] == [200, 200], [r.text for r in responses]
    async with env.factory() as db:
        assert await db.scalar(text("SELECT quantity FROM inv_stock_balance WHERE item_id=:i AND location_id=:l"), dict(i=b.out,l=b.loc1)) == 160
        assert await db.scalar(text("SELECT quantity FROM inv_stock_balance WHERE item_id=:i AND lot_id=:lot"), dict(i=b.raw,lot=b.raw_lot)) == 300


@pytest.mark.asyncio
async def test_legacy_packing_and_pack_applicability(env):
    # Existing package-count workflows and the meaning of 'both' are unchanged.
    for kind in ("forming","hot_process"):
        await request(env,"POST","/production/pack-types",dict(code="BOTH-"+kind,name="Both",applicable_type="both"),201)
        batch=await request(env,"POST","/production/batches",dict(process_type=kind,product_code="LEGACY-F" if kind=="forming" else "LEGACY-H",product_name="Old",production_date="2026-09-15",operator_signature_data_url=SIGN),201)
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


@pytest.mark.asyncio
async def test_enable_dual_use_item_moves_legacy_balance_and_is_idempotent(env):
    async with env.factory() as db:
        loc = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('DUAL-L','Dual location') RETURNING id"))
        item = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('DUAL-PORK','Dual pork','raw','KG') RETURNING id"))
        await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=item,l=loc))
        await db.execute(text("INSERT INTO inv_stock_balance(item_id,location_id,quantity) VALUES (:i,:l,12.345)"), dict(i=item,l=loc))
        await db.commit()

    enabled = await request(env, "POST", f"/inventory/items/{item}/enable-meat-product", {"output_type": "intermediate"})
    assert enabled["item_type"] == "raw"
    assert enabled["lot_tracking_enabled"] is True
    assert enabled["meat_output_type"] == "intermediate"
    assert enabled["meat_product_id"]
    async with env.factory() as db:
        row = (await db.execute(text("""
            SELECT l.lot_code,l.origin_type,b.quantity
            FROM inv_stock_balance b JOIN inv_lots l ON l.id=b.lot_id
            WHERE b.item_id=:i AND b.location_id=:l
        """), dict(i=item,l=loc))).one()
        assert row.origin_type == "legacy" and row.lot_code.startswith("LEGACY-DUAL-PORK-")
        assert str(row.quantity) == "12.345"
        assert await db.scalar(text("SELECT count(*) FROM prod_products WHERE code='DUAL-PORK'")) == 1

    updated = await request(env, "POST", f"/inventory/items/{item}/enable-meat-product", {"output_type": "finished"})
    assert updated["meat_output_type"] == "finished" and updated["meat_product_id"] == enabled["meat_product_id"]
    async with env.factory() as db:
        assert await db.scalar(text("SELECT count(*) FROM inv_lots WHERE item_id=:i AND origin_type='legacy'"), dict(i=item)) == 1
        assert str(await db.scalar(text("SELECT sum(quantity) FROM inv_stock_balance WHERE item_id=:i"), dict(i=item))) == "12.345"

    async with env.factory() as db:
        bad = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('DUAL-BAD','Bad unit','raw','包') RETURNING id"))
        await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=bad,l=loc))
        conflict = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit) VALUES ('DUAL-CONFLICT','Conflict','raw','KG') RETURNING id"))
        await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=conflict,l=loc))
        await db.execute(text("INSERT INTO prod_products(code,name,product_type) VALUES ('DUAL-CONFLICT','Other','forming')"))
        await db.commit()
    await request(env, "POST", f"/inventory/items/{bad}/enable-meat-product", {"output_type": "finished"}, 422)
    await request(env, "POST", f"/inventory/items/{conflict}/enable-meat-product", {"output_type": "finished"}, 409)


@pytest.mark.asyncio
async def test_manual_lot_documents_split_lines_and_prevent_shortage(env):
    async with env.factory() as db:
        loc = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('LOT-L','Lot location') RETURNING id"))
        item = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit,lot_tracking_enabled,meat_output_type) VALUES ('LOT-PORK','Lot pork','raw','KG',true,'intermediate') RETURNING id"))
        await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=item,l=loc))
        lot1 = await db.scalar(text("INSERT INTO inv_lots(item_id,lot_code,origin_type) VALUES (:i,'LOT-A','manual_adjustment') RETURNING id"), dict(i=item))
        lot2 = await db.scalar(text("INSERT INTO inv_lots(item_id,lot_code,origin_type) VALUES (:i,'LOT-B','manual_adjustment') RETURNING id"), dict(i=item))
        await db.execute(text("INSERT INTO inv_stock_balance(item_id,location_id,lot_id,quantity) VALUES (:i,:l,:lot,6)"), dict(i=item,l=loc,lot=lot1))
        await db.execute(text("INSERT INTO inv_stock_balance(item_id,location_id,lot_id,quantity) VALUES (:i,:l,:lot,4)"), dict(i=item,l=loc,lot=lot2))
        await db.commit()

    no_lot = {"doc_type":"OUT","item_type_scope":"intermediate","lines":[{"item_id":item,"location_id":loc,"quantity":"1.000","unit":"KG"}]}
    await request(env, "POST", "/inventory/docs", no_lot, 422)
    out_doc = await request(env, "POST", "/inventory/docs", {"doc_type":"OUT","item_type_scope":"intermediate","lines":[
        {"item_id":item,"location_id":loc,"lot_id":lot1,"quantity":"6.000","unit":"KG"},
        {"item_id":item,"location_id":loc,"lot_id":lot2,"quantity":"4.000","unit":"KG"},
    ]}, 201)
    await request(env, "POST", f"/inventory/docs/{out_doc['id']}/post")
    shortage = await request(env, "POST", "/inventory/docs", {"doc_type":"OUT","lines":[
        {"item_id":item,"location_id":loc,"lot_id":lot1,"quantity":"0.001","unit":"KG"},
    ]}, 201)
    await request(env, "POST", f"/inventory/docs/{shortage['id']}/post", expected=400)

    in_doc = await request(env, "POST", "/inventory/docs", {"doc_type":"IN","item_type_scope":"raw","lines":[
        {"item_id":item,"location_id":loc,"new_lot_code":"ADJ-NEW","quantity":"1.250","unit":"KG"},
    ]}, 201)
    await request(env, "POST", f"/inventory/docs/{in_doc['id']}/post")
    lots = await request(env, "GET", f"/inventory/lots?item_id={item}&location_id={loc}&positive_only=true")
    assert [(lot["lot_code"], lot["quantity"]) for lot in lots["items"]] == [("ADJ-NEW", "1.250")]
    balances = await request(env, "GET", f"/inventory/balance?item_id={item}&location_id={loc}")
    assert balances["items"][0]["quantity"] == "1.250"
    assert {lot["lot_code"]: lot["quantity"] for lot in balances["items"][0]["lots"]}["ADJ-NEW"] == "1.250"
    movements = await request(env, "GET", f"/inventory/balance/movements?doc_id={in_doc['id']}")
    assert movements["items"][0]["lot_code"] == "ADJ-NEW" and movements["items"][0]["balance_after"] == "1.250"
    async with env.factory() as db:
        with pytest.raises(Exception, match="immutable"):
            await db.execute(text("UPDATE inv_lots SET lot_code='CHANGED' WHERE id=:lot"), dict(lot=in_doc["lines"][0]["lot_id"]))
        await db.rollback()


@pytest.mark.asyncio
async def test_receiving_creates_supplier_and_generated_lots(env):
    async with env.factory() as db:
        supplier = await db.scalar(text("INSERT INTO suppliers(name) VALUES ('Lot Supplier') RETURNING id"))
        loc = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('RCV-L','Receiving lot location') RETURNING id"))
        item = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit,lot_tracking_enabled,meat_output_type) VALUES ('RCV-PORK','Received pork','raw','KG',true,'intermediate') RETURNING id"))
        await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=item,l=loc))
        await db.commit()

    async def receive(batch_no):
        payload = dict(supplier_id=supplier, product_name="Received pork", quantity="3.500", quantity_unit="KG",
            temp_frozen="-20", vehicle_cleanliness="Pass", packaging_integrity="Pass", acceptance_status="Accept",
            inv_item_id=item, supplier_batch_no=batch_no)
        log = await request(env, "POST", "/receiving-logs", payload, 201)
        await request(env, "POST", f"/receiving-logs/{log['id']}/lock")
        doc = await request(env, "POST", f"/receiving-logs/{log['id']}/convert-to-stock-in", {"location_id":loc})
        await request(env, "POST", f"/inventory/docs/{doc['id']}/post")
        return log, doc

    explicit, explicit_doc = await receive("SUP-LOT-88")
    generated, generated_doc = await receive(None)
    assert explicit_doc["lines"][0]["lot_code"] == "SUP-LOT-88"
    assert generated_doc["lines"][0]["lot_code"] == f"RCV-{generated['id']}"
    async with env.factory() as db:
        rows = (await db.execute(text("SELECT lot_code,is_system_generated,receiving_log_id FROM inv_lots WHERE item_id=:i ORDER BY id"), dict(i=item))).all()
        assert [(r.lot_code, r.is_system_generated, r.receiving_log_id) for r in rows] == [
            ("SUP-LOT-88", False, explicit["id"]),
            (f"RCV-{generated['id']}", True, generated["id"]),
        ]


@pytest.mark.asyncio
async def test_same_sku_conversion_uses_distinct_production_lot_and_blocks_void_after_consumption(env):
    b = await setup_batch(env)
    async with env.factory() as db:
        await db.execute(text("UPDATE inv_items SET meat_output_type='intermediate' WHERE id=:i"), dict(i=b.raw))
        await db.commit()
    b.data["outputs"] = [
        dict(inv_item_id=b.raw, weight_kg="80.000", location_id=b.loc1),
        dict(inv_item_id=b.raw, weight_kg="25.000", location_id=b.loc2),
    ]
    await verified(env, b)
    env.role["role"] = "Warehouse"
    await request(env, "POST", f"/production/batches/{b.id}/meat/enter-stock", {"version":1})
    batch = await request(env, "GET", f"/production/batches/{b.id}")
    async with env.factory() as db:
        prod_lot = await db.scalar(text("SELECT id FROM inv_lots WHERE item_id=:i AND prod_batch_id=:b"), dict(i=b.raw,b=b.id))
        assert prod_lot and prod_lot != b.raw_lot
        assert await db.scalar(text("SELECT sum(quantity) FROM inv_stock_balance WHERE item_id=:i AND lot_id=:lot"), dict(i=b.raw,lot=prod_lot)) == 105
    consume = await request(env, "POST", "/inventory/docs", {"doc_type":"OUT","lines":[
        {"item_id":b.raw,"location_id":b.loc1,"lot_id":prod_lot,"quantity":"1.000","unit":"KG"},
    ]}, 201)
    await request(env, "POST", f"/inventory/docs/{consume['id']}/post")
    env.role["role"] = "Admin"
    await request(env, "POST", f"/production/batches/{b.id}/void", {"void_reason":"Cannot reverse consumed output"}, 409)
    batch_after = await request(env, "GET", f"/production/batches/{b.id}")
    assert batch_after["is_voided"] is False and batch_after["input_stock_doc_id"] == batch["input_stock_doc_id"]


@pytest.mark.asyncio
async def test_meat_stock_rejects_insufficient_source_lot_without_partial_documents(env):
    b = await setup_batch(env)
    await verified(env, b)
    async with env.factory() as db:
        await db.execute(text("UPDATE inv_stock_balance SET quantity=99 WHERE item_id=:i AND lot_id=:lot"), dict(i=b.raw,lot=b.raw_lot))
        await db.commit()
    env.role["role"] = "Warehouse"
    await request(env, "POST", f"/production/batches/{b.id}/meat/enter-stock", {"version":1}, 400)
    async with env.factory() as db:
        assert await db.scalar(text("SELECT count(*) FROM inv_stock_docs WHERE doc_number IN (:out,:inn)"), dict(out=f"OUT-MEAT-{b.id}",inn=f"IN-MEAT-{b.id}")) == 0
        assert await db.scalar(text("SELECT quantity FROM inv_stock_balance WHERE item_id=:i AND lot_id=:lot"), dict(i=b.raw,lot=b.raw_lot)) == 99


@pytest.mark.asyncio
async def test_stocktake_counts_each_lot_and_adds_discovered_lot(env):
    async with env.factory() as db:
        loc = await db.scalar(text("INSERT INTO inv_locations(code,name) VALUES ('COUNT-L','Count location') RETURNING id"))
        item = await db.scalar(text("INSERT INTO inv_items(code,name,item_type,base_unit,lot_tracking_enabled,meat_output_type) VALUES ('COUNT-PORK','Count pork','raw','KG',true,'intermediate') RETURNING id"))
        await db.execute(text("INSERT INTO inv_item_allowed_locations(item_id,location_id) VALUES (:i,:l)"), dict(i=item,l=loc))
        lot1 = await db.scalar(text("INSERT INTO inv_lots(item_id,lot_code,origin_type) VALUES (:i,'COUNT-A','manual_adjustment') RETURNING id"), dict(i=item))
        lot2 = await db.scalar(text("INSERT INTO inv_lots(item_id,lot_code,origin_type) VALUES (:i,'COUNT-B','manual_adjustment') RETURNING id"), dict(i=item))
        await db.execute(text("INSERT INTO inv_stock_balance(item_id,location_id,lot_id,quantity) VALUES (:i,:l,:lot,2)"), dict(i=item,l=loc,lot=lot1))
        await db.execute(text("INSERT INTO inv_stock_balance(item_id,location_id,lot_id,quantity) VALUES (:i,:l,:lot,3)"), dict(i=item,l=loc,lot=lot2))
        await db.commit()

    env.role["role"] = "Warehouse"
    stocktake = await request(env, "POST", "/inventory/stocktakes", {"location_id":loc,"count_date":"2026-09-15"}, 201)
    rows = {line["lot_code"]:line for line in stocktake["lines"] if line["item_id"] == item}
    assert set(rows) == {"COUNT-A", "COUNT-B"}
    await request(env, "PATCH", f"/inventory/stocktakes/{stocktake['id']}/lines/{rows['COUNT-A']['id']}", {"physical_qty":"1.500"})
    await request(env, "PATCH", f"/inventory/stocktakes/{stocktake['id']}/lines/{rows['COUNT-B']['id']}", {"physical_qty":"4.000"})
    stocktake = await request(env, "POST", f"/inventory/stocktakes/{stocktake['id']}/discovered-lots", {
        "item_id":item,"lot_code":"COUNT-FOUND","physical_qty":"1.250"
    })
    assert any(line["lot_code"] == "COUNT-FOUND" for line in stocktake["lines"])
    confirmed = await request(env, "POST", f"/inventory/stocktakes/{stocktake['id']}/confirm")
    assert confirmed["status"] == "confirmed" and confirmed["adj_in_doc_id"] and confirmed["adj_out_doc_id"]
    async with env.factory() as db:
        balances = (await db.execute(text("""
            SELECT l.lot_code,b.quantity FROM inv_stock_balance b
            JOIN inv_lots l ON l.id=b.lot_id WHERE b.item_id=:i ORDER BY l.lot_code
        """), dict(i=item))).all()
        assert [(row.lot_code, str(row.quantity)) for row in balances] == [
            ("COUNT-A", "1.500"), ("COUNT-B", "4.000"), ("COUNT-FOUND", "1.250")
        ]
