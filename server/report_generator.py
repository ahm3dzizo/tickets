"""
تقرير إقفال تذكرة الصيانة - مولد PDF/JPG
Close Ticket Report Generator (ReportLab + Arabic RTL)
"""
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import arabic_reshaper
from bidi.algorithm import get_display

import fitz  # PyMuPDF for PDF→JPG
import tempfile

# ─── Constants ───────────────────────────────────────────────────
OUTPUT_DIR = os.environ.get("REPORT_OUTPUT_DIR", tempfile.gettempdir())
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Look for fonts in multiple locations
_FONTS_CANDIDATES = [
    os.path.join(SCRIPT_DIR, "fonts"),
    os.path.join(SCRIPT_DIR, "..", "fonts"),
    os.path.join(os.path.dirname(SCRIPT_DIR), "fonts"),
]
FONTS_DIR = next((p for p in _FONTS_CANDIDATES if os.path.exists(os.path.join(p, "Tajawal-Regular.ttf"))), os.path.join(SCRIPT_DIR, "fonts"))
# Check multiple locations for logo
_LOGO_CANDIDATES = [
    os.path.join(SCRIPT_DIR, "logo.jpg"),
    os.path.join(SCRIPT_DIR, "public", "logo.jpg"),
    os.path.join(SCRIPT_DIR, "public", "logo.png"),
    os.path.join(SCRIPT_DIR, "..", "public", "logo.jpg"),
    os.path.join(SCRIPT_DIR, "..", "public", "logo.png"),
    os.path.join(SCRIPT_DIR, "logo.png"),
]
LOGO_PATH = next((p for p in _LOGO_CANDIDATES if os.path.exists(p)), None)

# Register Tajawal fonts
pdfmetrics.registerFont(TTFont("Tajawal", os.path.join(FONTS_DIR, "Tajawal-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Tajawal-Bold", os.path.join(FONTS_DIR, "Tajawal-Bold.ttf")))

# Default fonts
FONT = "Tajawal"
FONT_B = "Tajawal-Bold"

# Colors
BORDER_COLOR = colors.HexColor("#505050")
LABEL_FILL = colors.HexColor("#EAEAEA")
SECTION_FILL = colors.HexColor("#D9D9D9")   # section headers fill

# Border widths
BORDER_INNER = 1.0
BORDER_OUTER = 1.8

# ─── Arabic Presentation Forms Fallback ──────────────────────────
# Tajawal (and many Google Arabic fonts) are missing ISOLATED forms
# in the Arabic Presentation Forms B block but have the base chars.
# Map: presentation form code → base Arabic character
_PRES_TO_BASE = {}

def _build_pres_map():
    """Build mapping from presentation forms to base characters."""
    import unicodedata
    for code in range(0xFE70, 0xFF00):
        try:
            ch = chr(code)
            name = unicodedata.name(ch, "")
            # Extract the base letter name, e.g. "ARABIC LETTER BEH ISOLATED FORM"
            if "ARABIC" in name:
                decomp = unicodedata.decomposition(ch)
                if decomp:
                    # decomp like '<isolated> 0628'
                    parts = decomp.split()
                    base_code = int(parts[-1], 16)
                    _PRES_TO_BASE[code] = chr(base_code)
        except (ValueError, IndexError):
            pass

_build_pres_map()

_missing_glyphs = None

def _get_missing():
    """Lazily check which presentation forms the font is missing"""
    global _missing_glyphs
    if _missing_glyphs is not None:
        return _missing_glyphs
    _missing_glyphs = set()
    try:
        font = pdfmetrics.getFont(FONT)
        for code in _PRES_TO_BASE:
            if font.face.charToGlyph.get(code, 0) == 0:
                _missing_glyphs.add(code)
    except Exception:
        pass
    return _missing_glyphs


def _fix_glyphs(text):
    """Replace missing presentation forms with base characters"""
    missing = _get_missing()
    if not missing:
        return text
    return ''.join(
        _PRES_TO_BASE.get(ord(ch), ch) if ord(ch) in missing else ch
        for ch in text
    )


def arabic(text):
    """Reshape and reorder Arabic text for correct RTL rendering"""
    if not text:
        return ""
    text = str(text)
    reshaped = arabic_reshaper.reshape(text)
    reshaped = _fix_glyphs(reshaped)
    return get_display(reshaped)


def _has_ar(text):
    return any('\u0600' <= ch <= '\u06FF' for ch in str(text))


def _display(text):
    return arabic(text) if _has_ar(text) else str(text)


def _truncate_to_cell(c, text, font, size, max_width):
    """Return text trimmed to max_width with trailing ... when needed."""
    raw = "" if text is None else str(text)
    shown = _display(raw)
    if c.stringWidth(shown, font, size) <= max_width:
        return shown

    suffix = "..."
    lo, hi = 0, len(raw)
    best = suffix

    # Binary search longest prefix that fits with ellipsis.
    while lo <= hi:
        mid = (lo + hi) // 2
        candidate = _display(raw[:mid] + suffix)
        if c.stringWidth(candidate, font, size) <= max_width:
            best = candidate
            lo = mid + 1
        else:
            hi = mid - 1

    return best


def draw_cell(c, x, y, w, h, text="", font=FONT, size=11,
              align="center", fill=None, ellipsis=False):
    """Draw a bordered cell with optional fill and text"""
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(BORDER_INNER)
    if fill:
        c.setFillColor(fill)
        c.rect(x, y, w, h, fill=1, stroke=1)
    else:
        c.rect(x, y, w, h, fill=0, stroke=1)

    if text:
        c.setFillColor(colors.black)
        c.setFont(font, size)
        max_text_w = max(4 * mm, w - 6 * mm)
        d = _truncate_to_cell(c, text, font, size, max_text_w) if ellipsis else _display(text)
        tw = c.stringWidth(d, font, size)
        ty = y + h / 2 - size * 0.35

        if align == "right":
            c.drawString(x + w - tw - 3 * mm, ty, d)
        elif align == "left":
            c.drawString(x + 3 * mm, ty, d)
        else:
            c.drawString(x + (w - tw) / 2, ty, d)

    c.setFillColor(colors.black)


def draw_outer_box(c, x, y, w, h):
    """Draw a thick outer border around a section"""
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(BORDER_OUTER)
    c.rect(x, y, w, h, fill=0, stroke=1)


def draw_section_header(c, x, y, w, h, text):
    """Section header: filled background, bold centered text, no underline"""
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(BORDER_INNER)
    c.setFillColor(SECTION_FILL)
    c.rect(x, y, w, h, fill=1, stroke=1)

    c.setFillColor(colors.black)
    d = arabic(text)
    c.setFont(FONT_B, 13)
    tw = c.stringWidth(d, FONT_B, 13)
    c.drawString(x + (w - tw) / 2, y + h / 2 - 13 * 0.35, d)

    c.setFillColor(colors.black)


def generate_close_report(ticket_num, villa, customer_name, phone,
                           maint_items, notes="",
                           block="", project="نساج تاون – الفرسان",
                           status="تم", ticket_date="", nhc="",
                           priority="الأولوية"):
    """Generate close ticket report as JPG. Returns jpg_path."""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    pdf_path = os.path.join(OUTPUT_DIR, f"{villa}_temp.pdf")
    jpg_path = os.path.join(OUTPUT_DIR, f"{villa}.jpg")

    page_w, page_h = A4
    margin = 10 * mm          # narrow margins
    content_w = page_w - 2 * margin
    left = margin
    right = page_w - margin

    c = canvas.Canvas(pdf_path, pagesize=A4)

    today = datetime.now().strftime("%Y-%m-%d")
    row_h = 9 * mm

    # ════════════════════════════════════════════════════════════
    # HEADER
    # ════════════════════════════════════════════════════════════
    y = page_h - 15 * mm

    # Logo centered
    if LOGO_PATH and os.path.exists(LOGO_PATH):
        logo_h = 22 * mm
        logo_w = 17 * mm
        c.drawImage(LOGO_PATH,
                     left + (content_w - logo_w) / 2, y - 14 * mm,
                     logo_w, logo_h,
                     preserveAspectRatio=True, anchor='c', mask='auto')

    # Titles on same baseline
    title_y = y - 6 * mm
    c.setFont(FONT_B, 18)
    ar = arabic("طلب صيانة")
    c.drawString(right - c.stringWidth(ar, FONT_B, 18), title_y, ar)
    c.setFont(FONT_B, 16)
    c.drawString(left, title_y, "Maintenance Request")

    y -= 24 * mm

    # ════════════════════════════════════════════════════════════
    # TICKET INFO TABLE
    # ════════════════════════════════════════════════════════════
    half_w = content_w / 2
    label_w = 32 * mm
    val_w = half_w - label_w

    display_date = ticket_date if ticket_date else today

    info_rows = [
        ("رقم الطلب", str(ticket_num), "التاريخ", display_date),
        ("اسم المشروع", project, "تاريخ الإغلاق", today),
        ("البلوك", str(block) if block else "", "حالة البطاقة", status),
    ]

    table_start_y = y
    for r_label, r_value, l_label, l_value in info_rows:
        draw_cell(c, right - label_w, y - row_h, label_w, row_h,
                  r_label, FONT_B, 11, "center", fill=LABEL_FILL)
        # Auto-shrink font for long ticket numbers
        val_font = FONT_B if r_label == "رقم الطلب" else FONT
        val_size = 11
        if r_label == "رقم الطلب" and len(str(r_value)) > 10:
            val_size = 9
        draw_cell(c, right - label_w - val_w, y - row_h, val_w, row_h,
                  r_value, val_font, val_size, "center")
        draw_cell(c, left + val_w, y - row_h, label_w, row_h,
                  l_label, FONT_B, 11, "center", fill=LABEL_FILL)
        draw_cell(c, left, y - row_h, val_w, row_h,
                  l_value, FONT, 11, "center")
        y -= row_h

        # Row 4: رقم الوحدة | villa + اختصار المشروع split | الأولوية
    sub_val_w = val_w / 2  # split the right value cell in two
    draw_cell(c, right - label_w, y - row_h, label_w, row_h,
              "رقم الوحدة", FONT_B, 11, "center", fill=LABEL_FILL)
    draw_cell(c, right - label_w - sub_val_w, y - row_h, sub_val_w, row_h,
              str(villa), FONT_B, 12, "center")
    draw_cell(c, right - label_w - val_w, y - row_h, sub_val_w, row_h,
              str(nhc) if nhc else "", FONT_B, 11, "center")
    draw_cell(c, left + val_w, y - row_h, label_w, row_h,
              "الأولوية", FONT_B, 11, "center", fill=LABEL_FILL)
    draw_cell(c, left, y - row_h, val_w, row_h,
              priority, FONT, 11, "center")
    y -= row_h

    # Row 5: تاريخ التسليم | | تاريخ انتهاء الضمان | today
    draw_cell(c, right - label_w, y - row_h, label_w, row_h,
              "تاريخ التسليم", FONT_B, 11, "center", fill=LABEL_FILL)
    draw_cell(c, right - label_w - val_w, y - row_h, val_w, row_h,
              "", FONT, 11, "center")
    draw_cell(c, left + val_w, y - row_h, label_w, row_h,
              "تاريخ انتهاء الضمان", FONT_B, 9, "center", fill=LABEL_FILL)
    draw_cell(c, left, y - row_h, val_w, row_h,
              "", FONT, 11, "center")
    y -= row_h

    # Outer border for entire ticket info table
    draw_outer_box(c, left, y, content_w, table_start_y - y)

    y -= 5 * mm

    # ════════════════════════════════════════════════════════════
    # CUSTOMER INFO
    # ════════════════════════════════════════════════════════════
    section_start = y
    draw_section_header(c, left, y - row_h, content_w, row_h, "معلومات العميل")
    y -= row_h

    cust_label_w = 30 * mm
    cust_val_w = content_w - cust_label_w

    draw_cell(c, right - cust_label_w, y - row_h, cust_label_w, row_h,
              "الإسم", FONT_B, 11, "center", fill=LABEL_FILL)
    draw_cell(c, left, y - row_h, cust_val_w, row_h,
              customer_name, FONT_B, 11, "center")
    y -= row_h

    draw_cell(c, right - cust_label_w, y - row_h, cust_label_w, row_h,
              "رقم الهاتف", FONT_B, 11, "center", fill=LABEL_FILL)
    draw_cell(c, left, y - row_h, cust_val_w, row_h,
              str(phone) if phone else "", FONT, 11, "center")
    y -= row_h

    draw_outer_box(c, left, y, content_w, section_start - y)
    y -= 5 * mm

    # ════════════════════════════════════════════════════════════
    # MAINTENANCE ITEMS (no section header, just table)
    # ════════════════════════════════════════════════════════════
    section_start = y
    status_col_w = 30 * mm
    desc_col_w = content_w - status_col_w

    # Column headers: نوع الصيانة on RIGHT, الحالة on LEFT
    draw_cell(c, right - desc_col_w, y - row_h, desc_col_w, row_h,
              "نوع الصيانة", FONT_B, 12, "center", fill=LABEL_FILL)
    draw_cell(c, left, y - row_h, status_col_w, row_h,
              "الحالة", FONT_B, 12, "center", fill=LABEL_FILL)
    y -= row_h

    for i in range(4):
        desc = maint_items[i][0] if i < len(maint_items) else ""
        st = maint_items[i][1] if i < len(maint_items) else ""
        draw_cell(c, right - desc_col_w, y - row_h, desc_col_w, row_h,
                  desc, FONT_B, 11, "right", ellipsis=True)
        draw_cell(c, left, y - row_h, status_col_w, row_h,
                  st, FONT_B, 11, "center")
        y -= row_h

    draw_outer_box(c, left, y, content_w, section_start - y)
    y -= 5 * mm

    # ════════════════════════════════════════════════════════════
    # NOTES
    # ════════════════════════════════════════════════════════════
    section_start = y
    draw_section_header(c, left, y - row_h, content_w, row_h, "ملاحظات")
    y -= row_h

    notes_h = 18 * mm
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(BORDER_INNER)
    c.rect(left, y - notes_h, content_w, notes_h, fill=0, stroke=1)

    if notes:
        c.setFont(FONT, 11)
        c.setFillColor(colors.black)
        lines = notes.split("\n")
        ny = y - 6 * mm
        for line in lines[:3]:
            d = _display(line)
            tw = c.stringWidth(d, FONT, 11)
            c.drawString(right - tw - 3 * mm, ny, d)
            ny -= 5 * mm

    y -= notes_h
    draw_outer_box(c, left, y, content_w, section_start - y)
    y -= 5 * mm

    # ════════════════════════════════════════════════════════════
    # CUSTOMER RATING
    # ════════════════════════════════════════════════════════════
    section_start = y
    draw_section_header(c, left, y - row_h, content_w, row_h, "تقييم العميل")
    y -= row_h

    rating_h = 11 * mm
    half_w = content_w / 2
    ratings = [
        ("ممتاز", "جيد جدا"),
        ("جيد", "ضعيف"),
        ("ضعيف جدا  ( رجاء ذكر السبب )", "ملاحظات"),
    ]

    for r_text, l_text in ratings:
        c.setStrokeColor(BORDER_COLOR)
        c.setLineWidth(BORDER_INNER)
        c.rect(left + half_w, y - rating_h, half_w, rating_h, fill=0, stroke=1)
        c.rect(left, y - rating_h, half_w, rating_h, fill=0, stroke=1)

        c.setFillColor(colors.black)
        box_size = 3.5 * mm
        ty = y - rating_h / 2 - 4

        # Right cell
        bx = right - 5 * mm - box_size
        c.rect(bx, y - rating_h / 2 - box_size / 2, box_size, box_size)
        rd = arabic(r_text)
        c.setFont(FONT, 10)
        c.drawString(bx - c.stringWidth(rd, FONT, 10) - 2 * mm, ty, rd)

        # Left cell
        bx2 = left + half_w - 5 * mm - box_size
        c.rect(bx2, y - rating_h / 2 - box_size / 2, box_size, box_size)
        ld = arabic(l_text)
        c.drawString(bx2 - c.stringWidth(ld, FONT, 10) - 2 * mm, ty, ld)

        y -= rating_h

    draw_outer_box(c, left, y, content_w, section_start - y)
    y -= 8 * mm

    # ════════════════════════════════════════════════════════════
    # SIGNATURE (right-aligned, pushed to bottom)
    # ════════════════════════════════════════════════════════════
    # Push to bottom of page
    sig_y = margin + 25 * mm

    c.setFont(FONT_B, 13)
    sig = arabic("توقيع العميل")
    sig_tw = c.stringWidth(sig, FONT_B, 13)
    c.drawString(right - sig_tw, sig_y, sig)

    sig_y -= 14 * mm
    c.setFont(FONT, 11)
    paren = "(                                           )"
    pw = c.stringWidth(paren, FONT, 11)
    c.drawString(right - pw, sig_y, paren)

    # ════════════════════════════════════════════════════════════
    # SAVE & CONVERT
    # ════════════════════════════════════════════════════════════
    c.save()

    doc = fitz.open(pdf_path)
    page = doc[0]
    mat = fitz.Matrix(200 / 72, 200 / 72)
    pix = page.get_pixmap(matrix=mat)
    pix.save(jpg_path)
    doc.close()
    os.remove(pdf_path)

    return jpg_path


if __name__ == "__main__":
    import sys
    import json

    if '--stdin' in sys.argv:
        # Called by the Node.js server: read JSON from stdin, return JPG path to stdout
        import io
        stdin_bytes = sys.stdin.buffer.read()
        data = json.loads(stdin_bytes.decode('utf-8'))
        # Convert maint_items from list-of-lists to list-of-tuples
        if 'maint_items' in data:
            data['maint_items'] = [tuple(item) for item in data['maint_items']]
        result_path = generate_close_report(**data)
        print(result_path, flush=True)
    else:
        path = generate_close_report(
            ticket_num=183017,
            villa=492,
            customer_name="ابراهيم صالح ابراهيم القبيسي",
            phone="+966560007904",
            maint_items=[
                ("كسر في ماسورة الخزان الارضي", "تم"),
            ],
            notes="",
            block="21",
            ticket_date="2026-03-15",
        )
        print(f"Report saved: {path}")
