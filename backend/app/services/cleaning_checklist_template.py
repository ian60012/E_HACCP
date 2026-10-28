"""Canonical bilingual checklist items transcribed from FSP-LOG-CLN-003/005."""

from copy import deepcopy


_SECTIONS = [
    (
        "1.0",
        "COOKING ROOM",
        "熱加工區",
        [
            ("1.1", "Walls", "牆面"),
            ("1.2", "Floor", "地板"),
            ("1.3", "Sink", "水池"),
            ("1.4", "Wok Station", "灶台"),
            ("1.5", "Steamer", "蒸箱"),
            ("1.6", "Storage Equipment", "儲存設備"),
            ("1.7", "Workstations", "操作台"),
        ],
    ),
    (
        "2.0",
        "PROCESSING ROOM",
        "加工區",
        [
            ("2.1", "Walls", "牆面"),
            ("2.2", "Floor", "地板"),
            ("2.3", "Sink", "水池"),
            ("2.4", "Dumpling Machine", "水餃機"),
            ("2.5", "Mixing Machine", "攪拌機"),
            ("2.6", "Sealing Machine", "真空機"),
            ("2.7", "Other Machines", "其他機器"),
            ("2.8", "Metal Detection Machine", "金屬檢測機"),
            ("2.9", "Storage Equipment", "儲存設備"),
            ("2.10", "Workstations", "操作台"),
        ],
    ),
    (
        "3.0",
        "GENERAL AREA",
        "其他區域",
        [
            ("3.1", "Walls", "牆面"),
            ("3.2", "Floor", "地板"),
        ],
    ),
    (
        "4.0",
        "STORAGE AREA",
        "儲存區域",
        [
            ("4.1", "Freezer", "凍庫"),
            ("4.2", "Cool Room", "風房"),
            ("4.3", "Dry Storage Area", "其他儲存區域"),
        ],
    ),
]


def get_cleaning_checklist_template() -> list[dict]:
    """Return a fresh 22-item checklist so callers cannot mutate the canonical data."""
    items: list[dict] = []
    for section_code, section_en, section_zh, section_items in _SECTIONS:
        for code, item_en, item_zh in section_items:
            items.append(
                {
                    "code": code,
                    "section_code": section_code,
                    "section_name_en": section_en,
                    "section_name_zh": section_zh,
                    "item_name_en": item_en,
                    "item_name_zh": item_zh,
                    "result": None,
                    "comments": None,
                }
            )
    return deepcopy(items)
