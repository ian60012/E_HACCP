#!/usr/bin/env python3
"""
Convert Xero inventory export to E_HACCP import format.

Usage:
    python scripts/import_xero_items.py [INPUT_XLSX] [OUTPUT_XLSX]

Defaults:
    INPUT_XLSX  = InventoryItems-20260424.xlsx
    OUTPUT_XLSX = xero_import_ready.xlsx

The output file can be uploaded via the system's bulk import:
    POST /api/v1/inventory/items/import

Category mapping (by ItemCode prefix):
    INGR-DUMP   → 原料  (seasonings / ingredients)
    FLOUR-DUMP  → 原料  (flour)
    VEG-DUMP    → 原料  (vegetables)
    SEA-DUMP    → 原料  (seafood ingredients)
    INTERNAL    → 原料  (internal ingredients: salt, egg, rice…)
    MEAT-DUMP   → 原料肉 (raw meat)
    MEAT-LW     → 原料肉 (raw meat from LW supplier)
    PACK        → 包材   (packaging materials)

Unit defaults:
    PACK prefix → PCS
    everything else → KG
"""

import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

CATEGORY_MAP = {
    "INGR-DUMP": "原料",
    "FLOUR-DUMP": "原料",
    "VEG-DUMP": "原料",
    "SEA-DUMP": "原料",
    "INTERNAL": "原料",
    "MEAT-DUMP": "原料肉",
    "MEAT-LW": "原料肉",
    "MEAT - LW": "原料肉",  # handle variant with space
    "PACK": "包材",
}

DEFAULT_UNIT_BY_CATEGORY = {
    "包材": "PCS",
}
FALLBACK_UNIT = "KG"


def _get_category(code: str) -> str:
    code_upper = code.upper()
    for prefix, cat in CATEGORY_MAP.items():
        if code_upper.startswith(prefix.upper()):
            return cat
    return "其他"


def _get_unit(code: str, category: str) -> str:
    return DEFAULT_UNIT_BY_CATEGORY.get(category, FALLBACK_UNIT)


def _clean_name(name: str) -> str:
    """Remove garbled encoding artifacts from some MEAT-LW item names."""
    # Replace non-printable / mojibake characters with a clean version
    cleaned = name.encode("ascii", errors="ignore").decode("ascii").strip()
    # If we lost too much (>50% stripped), keep original
    if len(cleaned) < len(name) * 0.5:
        return name.strip()
    return cleaned


def read_xero_xlsx(path: str) -> list[dict]:
    """Parse the Xero export and return a list of item dicts."""
    with zipfile.ZipFile(path, "r") as z:
        with z.open("xl/sharedStrings.xml") as f:
            ss_tree = ET.parse(f)
        with z.open("xl/worksheets/sheet1.xml") as f:
            sheet_tree = ET.parse(f)

    # Build shared strings lookup
    strings = []
    for si in ss_tree.getroot().findall(f"{NS}si"):
        t = si.find(f"{NS}t")
        strings.append(t.text if t is not None else "")

    def cell_value(cell):
        t = cell.get("t", "")
        v = cell.find(f"{NS}v")
        if v is None:
            return ""
        return strings[int(v.text)] if t == "s" else v.text

    rows = sheet_tree.getroot().findall(f".//{NS}row")
    items = []
    for row in rows[1:]:  # skip header
        cells = [cell_value(c) for c in row.findall(f"{NS}c")]
        if not cells or not cells[0]:
            continue
        code = cells[0].strip()
        name = cells[1].strip() if len(cells) > 1 else code
        items.append({"code": code, "name": name})
    return items


def build_output_rows(items: list[dict]) -> list[list]:
    """Convert raw items to the E_HACCP import format rows."""
    header = ["品項代碼", "品項名稱", "分類", "基本單位", "描述", "允許儲位"]
    rows = [header]
    for item in items:
        code = item["code"]
        name = _clean_name(item["name"])
        category = _get_category(code)
        unit = _get_unit(code, category)
        rows.append([code, name, category, unit, "", ""])
    return rows


def write_xlsx(rows: list[list], path: str):
    """Write rows to a minimal xlsx file (no openpyxl needed)."""
    # Build XML content for the sheet
    xml_rows = []
    for r_idx, row in enumerate(rows, start=1):
        cells = []
        for c_idx, val in enumerate(row, start=1):
            col_letter = chr(ord("A") + c_idx - 1)
            cell_ref = f"{col_letter}{r_idx}"
            escaped = (
                str(val)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
            )
            cells.append(
                f'<c r="{cell_ref}" t="inlineStr"><is><t>{escaped}</t></is></c>'
            )
        xml_rows.append(f'<row r="{r_idx}">{"".join(cells)}</row>')

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        "<sheetData>"
        + "".join(xml_rows)
        + "</sheetData></worksheet>"
    )

    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<sheets><sheet name=\"Sheet1\" sheetId=\"1\" r:id=\"rId1\"/></sheets>"
        "</workbook>"
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'
        ' Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )

    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
        ' Target="xl/workbook.xml"/>'
        "</Relationships>"
    )

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", workbook_xml)
        z.writestr("xl/_rels/workbook.xml.rels", rels_xml)
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml)

    print(f"Written {len(rows) - 1} items to {path}")


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else "InventoryItems-20260424.xlsx"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "xero_import_ready.xlsx"

    if not Path(input_path).exists():
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)

    items = read_xero_xlsx(input_path)
    print(f"Read {len(items)} items from {input_path}")

    # Summary by category
    by_cat: dict[str, int] = {}
    for item in items:
        cat = _get_category(item["code"])
        by_cat[cat] = by_cat.get(cat, 0) + 1
    for cat, count in sorted(by_cat.items()):
        print(f"  {cat}: {count} items")

    rows = build_output_rows(items)
    write_xlsx(rows, output_path)
    print(f"\nUpload {output_path} via: POST /api/v1/inventory/items/import")


if __name__ == "__main__":
    main()
