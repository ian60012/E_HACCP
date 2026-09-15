"""Shared production label barcode and Chromium PDF rendering."""
import html
from fastapi import HTTPException, status

CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]


def _safe_filename(value: str) -> str:
    return "".join(
        ch if (ch.isascii() and (ch.isalnum() or ch in ("-", "_", "."))) else "_"
        for ch in value
    ).strip("_") or "carton-label"


def _trim_decimal(value: object, decimals: int = 3) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    text = f"{number:.{decimals}f}".rstrip("0").rstrip(".")
    return text or "0"


def _code128_svg(value: str) -> str:
    if not value or any(ord(ch) < 32 or ord(ch) > 126 for ch in value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Batch code must contain printable ASCII characters for barcode generation",
        )
    codes = [104, *[ord(ch) - 32 for ch in value]]
    checksum = codes[0] + sum(code * index for index, code in enumerate(codes[1:], start=1))
    codes.extend([checksum % 103, 106])

    module = 2
    height = 58
    quiet = 16
    x = quiet
    rects: list[str] = []
    for code in codes:
        pattern = CODE128_PATTERNS[code]
        for index, width_char in enumerate(pattern):
            width = int(width_char) * module
            if index % 2 == 0:
                rects.append(f'<rect x="{x}" y="0" width="{width}" height="{height}" />')
            x += width
    width = x + quiet
    escaped_value = html.escape(value)
    return (
        f'<svg class="barcode" viewBox="0 0 {width} 78" xmlns="http://www.w3.org/2000/svg" role="img" '
        f'aria-label="Batch barcode {escaped_value}">'
        f'<rect width="{width}" height="78" fill="#fff" />'
        f'<g fill="#111">{"".join(rects)}</g>'
        f'<text x="{width / 2}" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="12">{escaped_value}</text>'
        f'</svg>'
    )


async def _render_pdf(html_content: str, width: str = "100mm", height: str = "75mm") -> bytes:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF renderer is not installed. Install Playwright Chromium in the backend image.",
        ) from exc

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            page = await browser.new_page()
            await page.set_content(html_content, wait_until="load")
            await page.evaluate("""async () => {
                await document.fonts.ready;
                for (const element of document.querySelectorAll('[data-fit-text]')) {
                    let size = parseFloat(getComputedStyle(element).fontSize);
                    while (size > 8 && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) {
                        size -= 0.5;
                        element.style.fontSize = `${size}px`;
                    }
                }
            }""")
            return await page.pdf(
                print_background=True,
                prefer_css_page_size=True,
                page_ranges="1",
                width=width,
                height=height,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
        finally:
            await browser.close()


def build_meat_label_html(batch, record, output, item_code: str, data) -> str:
    states = {
        "draft": "IN PROGRESS — NOT QA VERIFIED",
        "submitted": "AWAITING QA — NOT QA VERIFIED",
        "verified": "QA VERIFIED",
        "stocked": "QA VERIFIED / STOCKED",
    }
    def escape(text):
        return html.escape(str(text))
    pack_count = str(data.pack_count) if data.pack_count is not None else "—"
    return f"""<!doctype html>
<html><head><meta charset="utf-8" /><style>
@page {{ size: 100mm 75mm; margin: 0; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; width: 100mm; height: 75mm; }}
body {{ font-family: Arial, "Microsoft YaHei", sans-serif; color: #111; background: #fff; }}
.label {{ width: 100mm; height: 75mm; padding: 3mm 4mm; display: grid; grid-template-rows: 4mm 5mm minmax(0, 1fr) 10mm 10mm 4mm 10mm; gap: 1mm; overflow: hidden; }}
.header {{ display: flex; justify-content: space-between; border-bottom: .3mm solid #111; padding-bottom: 1mm; font-size: 7pt; font-weight: 800; }}
.batch {{ font-size: 11pt; font-weight: 800; overflow-wrap: anywhere; }}
.product {{ min-height: 0; display: flex; flex-direction: column; border-bottom: .25mm solid #111; padding-bottom: 1mm; }}
.key {{ font-size: 6.5pt; color: #444; font-weight: 700; }}
.product-name {{ flex: 1; min-height: 0; font-size: 20pt; font-weight: 900; line-height: 1.05; overflow-wrap: anywhere; overflow: hidden; }}
.metrics {{ display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }}
.value {{ height: 7mm; font-size: 16pt; font-weight: 900; }}
.meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: .8mm 2mm; font-size: 8pt; overflow-wrap: anywhere; }}
.state {{ font-size: 7pt; font-weight: 800; border: .25mm solid #111; padding: .6mm; }}
.barcode {{ width: 89mm; height: 10mm; display: block; margin: 0 auto; }}
</style></head><body><main class="label">
<header class="header"><span>FD CATERING SERVICE PTY LTD</span><span>MEAT CARTON LABEL</span></header>
<div class="batch" data-fit-text>Batch / Lot: {escape(batch.batch_code)}</div>
<section class="product"><div class="key">OUTPUT PRODUCT · {escape(item_code)}</div><div class="product-name" data-fit-text>{escape(output.item_name)}</div></section>
<section class="metrics"><div><div class="key">ACTUAL NET WEIGHT</div><div class="value" data-fit-text>{data.net_weight_kg:.3f} kg</div></div><div><div class="key">PACKS / CARTON</div><div class="value" data-fit-text>{pack_count}</div></div></section>
<section class="meta"><span data-fit-text>Pack: {escape(output.pack_type or 'Not specified')}</span><span data-fit-text>Location: {escape(output.location_name)}</span><span>Production: {batch.production_date.isoformat()}</span><span>Packing: {data.packing_date.isoformat()}</span></section>
<div class="state" data-fit-text>{states[record.state]} · v{record.version}</div>
{_code128_svg(batch.batch_code)}
</main></body></html>"""


