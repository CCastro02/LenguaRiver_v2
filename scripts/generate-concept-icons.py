"""
Generate high-quality flat PNG concept illustrations for My Words.
Run from LenguaRiver/:  python scripts/generate-concept-icons.py
"""
from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

SIZE = 512
BG = (244, 244, 242)
ACCENT = (13, 148, 136)
SLATE = (71, 85, 105)
GOLD = (217, 168, 58)
GOLD_DARK = (180, 130, 40)
GOLD_LIGHT = (255, 235, 170)
BLUE = (59, 130, 246)
BLUE_SOFT = (186, 214, 252)
BLUE_MUTED = (147, 197, 253)
CORAL = (231, 111, 81)
PURPLE = (124, 58, 237)
GREEN = (22, 163, 74)
GREEN_BRIGHT = (34, 197, 94)
RED_UP = (220, 38, 38)
INK = (30, 41, 59)
PAPER = (255, 255, 252)
PAPER_WARM = (252, 250, 245)
SHADOW = (180, 188, 198)
TEAL_SOFT = (204, 236, 232)


def lighten(color: tuple[int, int, int], amount: float = 0.35) -> tuple[int, int, int]:
    return tuple(min(255, int(c + (255 - c) * amount)) for c in color)


def new_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(im)
    pad = 16
    draw.rounded_rectangle(
        [pad, pad, SIZE - pad, SIZE - pad],
        radius=48,
        fill=BG,
        outline=SLATE,
        width=4,
    )
    return im, draw


def out_path(name: str) -> str:
    return os.path.join(
        os.path.dirname(__file__), "..", "public", "images", "concepts", name
    )


def save(name: str, image: Image.Image) -> None:
    p = out_path(name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    image.save(p, "PNG", optimize=True)
    print("wrote", p)


def draw_soft_blob(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    rx: int,
    ry: int,
    color: tuple[int, int, int],
) -> None:
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=lighten(color, 0.55))


def draw_shadow_oval(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    rx: int,
    ry: int,
    offset: tuple[int, int] = (10, 14),
) -> None:
    ox, oy = offset
    draw.ellipse([cx - rx + ox, cy - ry + oy, cx + rx + ox, cy + ry + oy], fill=SHADOW)


def draw_bar_chart(
    draw: ImageDraw.ImageDraw,
    cx: int,
    base_y: int,
    heights: list[int],
    bar_w: int = 36,
    gap: int = 14,
    colors: tuple[tuple[int, int, int], ...] | None = None,
    outline: bool = False,
) -> None:
    palette = colors or (BLUE_MUTED,) * len(heights)
    total_w = len(heights) * bar_w + (len(heights) - 1) * gap
    x = cx - total_w // 2
    for i, h in enumerate(heights):
        color = palette[i % len(palette)]
        x0, y0, x1, y1 = x, base_y - h, x + bar_w, base_y
        draw.rounded_rectangle([x0, y0, x1, y1], radius=8, fill=color, outline=SLATE if outline else None, width=2 if outline else 0)
        x += bar_w + gap


def draw_line_trend(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    color: tuple[int, int, int] = BLUE,
    width: int = 10,
) -> None:
    if len(points) < 2:
        return
    draw.line(points, fill=color, width=width, joint="curve")


def draw_up_arrow(
    draw: ImageDraw.ImageDraw,
    tip: tuple[int, int],
    tail: tuple[int, int],
    color: tuple[int, int, int] = GREEN_BRIGHT,
    shaft_w: int = 28,
    head_w: int = 52,
    head_h: int = 58,
    shadow: bool = True,
) -> None:
    tx, ty = tip
    bx, by = tail
    if shadow:
        draw.line([(bx + 8, by + 10), (tx + 8, ty + 10)], fill=SHADOW, width=shaft_w + 4)
        draw.polygon(
            [(tx + 8, ty + 10), (tx - head_w + 8, ty + head_h + 10), (tx + head_w + 8, ty + head_h + 10)],
            fill=SHADOW,
        )
    draw.line([(bx, by), (tx, ty)], fill=color, width=shaft_w)
    draw.polygon(
        [(tx, ty), (tx - head_w, ty + head_h), (tx + head_w, ty + head_h)],
        fill=color,
        outline=INK,
        width=3,
    )


def draw_dollar_sign(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: float = 1.0) -> None:
    s = scale
    draw.line([(cx, cy - 34 * s), (cx, cy + 34 * s)], fill=INK, width=int(8 * s))
    draw.arc(
        [cx - 22 * s, cy - 28 * s, cx + 22 * s, cy + 2 * s],
        start=200,
        end=340,
        fill=INK,
        width=int(7 * s),
    )
    draw.arc(
        [cx - 22 * s, cy - 2 * s, cx + 22 * s, cy + 28 * s],
        start=20,
        end=160,
        fill=INK,
        width=int(7 * s),
    )


def draw_coin(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    r: int,
    *,
    show_dollar: bool = False,
    shadow: bool = True,
) -> None:
    if shadow:
        draw_shadow_oval(draw, cx, cy, r, int(r * 0.28), offset=(8, 12))
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD, outline=INK, width=4)
    draw.ellipse(
        [cx - r + 8, cy - r + 6, cx + r - 8, cy - r + 22],
        fill=GOLD_LIGHT,
        outline=None,
    )
    draw.ellipse([cx - r + 6, cy - r + 6, cx + r - 6, cy + r - 6], outline=GOLD_DARK, width=3)
    if show_dollar:
        draw_dollar_sign(draw, cx, cy, scale=r / 52)
    else:
        draw.line([(cx, cy - r + 16), (cx, cy + r - 16)], fill=INK, width=max(4, r // 12))
        draw.arc(
            [cx - r // 2, cy - r // 3, cx + r // 2, cy + r // 3],
            start=200,
            end=20,
            fill=INK,
            width=max(4, r // 12),
        )


def draw_speech_bubble(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    tail: tuple[int, int],
    *,
    shadow: bool = True,
) -> None:
    x0, y0, x1, y1 = box
    if shadow:
        draw.rounded_rectangle([x0 + 8, y0 + 10, x1 + 8, y1 + 10], radius=40, fill=SHADOW)
    draw.rounded_rectangle(list(box), radius=40, fill=fill, outline=INK, width=4)
    mx = (x0 + x1) // 2
    draw.polygon([(mx - 22, y1), (mx + 22, y1), (tail[0], tail[1])], fill=fill, outline=INK, width=2)


def draw_letter_a(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: float = 1.2) -> None:
    s = scale
    draw.polygon(
        [
            (cx, cy - 44 * s),
            (cx + 34 * s, cy + 32 * s),
            (cx - 34 * s, cy + 32 * s),
        ],
        fill=PAPER,
        outline=INK,
        width=3,
    )
    draw.rectangle(
        [cx - 26 * s, cy - 6 * s, cx + 26 * s, cy + 14 * s],
        fill=PAPER,
        outline=INK,
        width=2,
    )


def draw_han_wen(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: float = 1.1) -> None:
    s = scale
    w = int(58 * s)
    stroke = int(12 * s)
    for y, x0, x1 in [
        (cy - int(38 * s), cx - w, cx + w),
        (cy + int(38 * s), cx - w, cx + w),
    ]:
        draw.line([(x0, y), (x1, y)], fill=PAPER, width=stroke)
    draw.line([(cx, cy - int(42 * s)), (cx, cy + int(42 * s))], fill=PAPER, width=stroke)


def draw_brain(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    scale: float = 1.0,
) -> None:
    s = scale
    draw.ellipse(
        [cx - 52 * s, cy - 38 * s, cx + 52 * s, cy + 38 * s],
        fill=lighten(PURPLE, 0.35),
        outline=INK,
        width=4,
    )
    for ox in (-28, 0, 28):
        draw.ellipse(
            [cx + ox * s - 18 * s, cy - 32 * s, cx + ox * s + 18 * s, cy + 4 * s],
            fill=lighten(PURPLE, 0.2),
            outline=INK,
            width=3,
        )


def draw_lightbulb(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    scale: float = 1.0,
) -> None:
    s = scale
    draw.ellipse([cx - 42 * s, cy - 52 * s, cx + 42 * s, cy + 8 * s], fill=GOLD, outline=INK, width=4)
    draw.rectangle([cx - 14 * s, cy + 4 * s, cx + 14 * s, cy + 28 * s], fill=GOLD_DARK, outline=INK, width=3)
    draw.polygon([(cx - 24 * s, cy + 28 * s), (cx + 24 * s, cy + 28 * s), (cx, cy + 48 * s)], fill=GOLD_DARK, outline=INK, width=3)
    draw.line([(cx - 55 * s, cy - 38 * s), (cx - 30 * s, cy - 58 * s)], fill=GOLD_LIGHT, width=8)
    draw.line([(cx + 30 * s, cy - 58 * s), (cx + 55 * s, cy - 38 * s)], fill=GOLD_LIGHT, width=8)


def draw_income_flow_arrows(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    color: tuple[int, int, int] = ACCENT,
) -> None:
    sx, sy = start
    ex, ey = end
    draw.line([(sx, sy), (ex, ey)], fill=color, width=14)
    draw.polygon([(ex, ey), (ex - 28, ey + 18), (ex - 28, ey - 18)], fill=color, outline=INK, width=2)


def draw_candlesticks(
    draw: ImageDraw.ImageDraw,
    cx: int,
    base_y: int,
    specs: list[tuple[int, int, int, tuple[int, int, int]]],
    body_w: int = 32,
) -> None:
    for dx, body_h, wick_h, color in specs:
        x = cx + dx
        draw.line([(x, base_y - wick_h), (x, base_y)], fill=SLATE, width=6)
        draw.rounded_rectangle(
            [x - body_w, base_y - body_h, x + body_w, base_y],
            radius=6,
            fill=color,
            outline=INK,
            width=2,
        )


def icon_revenue() -> Image.Image:
    """Stacked coins with $ and upward income arrow — no chart/landscape backdrop."""
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 10
    stack_x = cx - 110

    for i, (oy, r, show_dollar) in enumerate(
        [(70, 46, False), (28, 50, False), (-14, 54, False), (-58, 62, True)]
    ):
        draw_coin(draw, stack_x, cy + oy, r, show_dollar=show_dollar)

    draw_coin(draw, stack_x + 95, cy - 35, 88, show_dollar=True)

    draw_up_arrow(
        draw,
        tip=(cx + 168, cy - 155),
        tail=(cx + 55, cy + 85),
        color=GREEN_BRIGHT,
        shaft_w=34,
        head_w=60,
        head_h=66,
    )
    draw.line([(cx - 40, cy + 120), (cx + 210, cy + 120)], fill=ACCENT, width=14)
    draw_income_flow_arrows(draw, (cx - 120, cy + 120), (cx + 35, cy + 120), color=ACCENT)
    draw_income_flow_arrows(draw, (cx + 35, cy + 120), (cx + 175, cy + 120), color=lighten(ACCENT, 0.15))
    return im


def icon_venture() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 35

    path_pts = [(cx - 175, cy + 125), (cx - 55, cy + 45), (cx + 45, cy + 5), (cx + 165, cy - 75)]
    draw.line([(p[0] + 6, p[1] + 8) for p in path_pts], fill=SHADOW, width=18)
    draw.line(path_pts, fill=ACCENT, width=16)
    for px, py in path_pts[1:]:
        draw.ellipse([px - 16, py - 16, px + 16, py + 16], fill=PAPER, outline=INK, width=3)

    fx, fy = path_pts[-1]
    draw.line([(fx, fy - 55), (fx, fy + 5)], fill=SLATE, width=8)
    draw.polygon([(fx, fy - 70), (fx + 42, fy - 38), (fx, fy - 6)], fill=CORAL, outline=INK, width=3)

    draw_shadow_oval(draw, cx, cy, 58, 95, offset=(12, 16))
    body = [
        (cx, cy - 145),
        (cx + 62, cy + 35),
        (cx + 34, cy + 100),
        (cx - 34, cy + 100),
        (cx - 62, cy + 35),
    ]
    draw.polygon(body, fill=CORAL, outline=INK, width=5)
    draw.ellipse([cx - 42, cy - 55, cx + 42, cy + 15], fill=PAPER, outline=INK, width=4)
    draw.ellipse([cx - 18, cy - 32, cx + 18, cy + 2], fill=lighten(BLUE, 0.3), outline=SLATE, width=2)
    draw.polygon(
        [(cx - 88, cy + 15), (cx - 115, cy + 115), (cx - 48, cy + 78)],
        fill=SLATE,
        outline=INK,
        width=3,
    )
    draw.polygon(
        [(cx + 88, cy + 15), (cx + 115, cy + 115), (cx + 48, cy + 78)],
        fill=SLATE,
        outline=INK,
        width=3,
    )
    for i, col in enumerate([GOLD_LIGHT, CORAL, ACCENT]):
        draw.ellipse(
            [cx - 18 + i * 5, cy + 95 + i * 16, cx + 18 + i * 5, cy + 125 + i * 16],
            fill=col,
            outline=INK,
            width=2,
        )
    draw_up_arrow(
        draw,
        tip=(cx + 155, cy - 105),
        tail=(cx + 155, cy + 15),
        color=GREEN_BRIGHT,
        shaft_w=22,
        head_w=44,
        head_h=50,
    )
    draw.line([(cx - 175, cy + 40), (cx - 95, cy + 95)], fill=lighten(CORAL, 0.2), width=12)
    draw.polygon([(cx - 95, cy + 95), (cx - 115, cy + 75), (cx - 75, cy + 75)], fill=CORAL, outline=INK, width=2)
    return im


def icon_company() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2

    draw_soft_blob(draw, cx, 290, 175, 150, TEAL_SOFT)
    draw_shadow_oval(draw, cx, 285, 115, 140, offset=(14, 18))
    draw.rectangle([cx - 115, 175, cx + 115, 385], fill=SLATE, outline=INK, width=5)
    draw.rectangle([cx - 48, 105, cx + 48, 185], fill=SLATE, outline=INK, width=4)
    draw.rectangle([cx - 30, 85, cx + 30, 115], fill=lighten(SLATE, 0.15), outline=INK, width=3)
    for row, y in enumerate([205, 265, 325]):
        for col in range(3):
            x0 = cx - 82 + col * 54
            lit = (row + col) % 2 == 0
            draw.rounded_rectangle(
                [x0, y, x0 + 38, y + 42],
                radius=6,
                fill=ACCENT if lit else lighten(SLATE, 0.55),
                outline=INK,
                width=2,
            )
    draw.rounded_rectangle([cx - 42, 310, cx + 42, 385], radius=10, fill=PAPER_WARM, outline=INK, width=4)
    draw.line([(cx - 18, 340), (cx + 18, 340)], fill=ACCENT, width=6)
    return im


def icon_investment() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 30

    draw_bar_chart(
        draw,
        cx + 85,
        390,
        [45, 70, 60, 95, 80],
        bar_w=26,
        gap=10,
        colors=(lighten(GREEN, 0.5),) * 5,
        outline=True,
    )
    draw_line_trend(
        draw,
        [(cx + 10, 360), (cx + 70, 310), (cx + 130, 325), (cx + 190, 250)],
        color=GREEN,
        width=10,
    )

    draw_coin(draw, cx - 25, cy + 70, 78, show_dollar=True)
    draw.rectangle([cx - 16, cy - 20, cx + 16, cy + 55], fill=GREEN, outline=INK, width=4)
    draw.ellipse([cx - 95, cy - 110, cx - 12, cy - 35], fill=GREEN_BRIGHT, outline=INK, width=4)
    draw.ellipse([cx + 12, cy - 110, cx + 95, cy - 35], fill=GREEN_BRIGHT, outline=INK, width=4)
    draw.polygon([(cx, cy - 125), (cx - 8, cy - 95), (cx + 8, cy - 95)], fill=GREEN, outline=INK, width=2)
    draw_up_arrow(draw, tip=(cx + 125, cy - 135), tail=(cx + 40, cy - 25), color=ACCENT, shaft_w=24, head_w=48, head_h=54)
    return im


def icon_market() -> Image.Image:
    im, draw = new_canvas()
    cx, base = SIZE // 2, 395

    draw_soft_blob(draw, cx, 260, 200, 175, BLUE_SOFT)
    draw_candlesticks(
        draw,
        cx,
        base,
        [
            (-135, 75, 95, GREEN_BRIGHT),
            (-75, 115, 120, GREEN_BRIGHT),
            (-15, 90, 100, CORAL),
            (45, 140, 130, GREEN_BRIGHT),
            (105, 100, 110, GREEN_BRIGHT),
        ],
        body_w=34,
    )
    pts = [(cx - 165, base - 50)]
    for dx, body_h, _, _ in [
        (-135, 75, 0, GREEN),
        (-75, 115, 0, GREEN),
        (-15, 90, 0, GREEN),
        (45, 140, 0, GREEN),
        (105, 100, 0, GREEN),
    ]:
        pts.append((cx + dx, base - body_h - 28))
    draw_line_trend(draw, pts, color=BLUE, width=12)
    return im


def icon_learning() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 55

    draw_shadow_oval(draw, cx, cy + 35, 140, 38, offset=(10, 14))
    book_y = cy + 10
    draw.rounded_rectangle(
        [cx - 145, book_y - 10, cx - 8, book_y + 110],
        radius=14,
        fill=PAPER,
        outline=INK,
        width=5,
    )
    draw.rounded_rectangle(
        [cx + 8, book_y - 10, cx + 145, book_y + 110],
        radius=14,
        fill=PAPER_WARM,
        outline=INK,
        width=5,
    )
    draw.line([(cx, book_y - 10), (cx, book_y + 110)], fill=INK, width=6)
    for y in range(book_y + 18, book_y + 95, 22):
        draw.line([(cx - 120, y), (cx - 28, y)], fill=ACCENT, width=7)
        draw.line([(cx + 28, y), (cx + 120, y)], fill=PURPLE, width=7)

    draw_lightbulb(draw, cx - 70, cy - 115, scale=0.95)
    draw_brain(draw, cx + 70, cy - 105, scale=0.95)
    return im


def icon_translation() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2

    draw_soft_blob(draw, cx, cy + 10, 210, 175, TEAL_SOFT)
    draw_speech_bubble(draw, (cx - 215, cy - 95, cx - 25, cy + 55), ACCENT, (cx - 130, cy + 105))
    draw_speech_bubble(draw, (cx + 25, cy - 95, cx + 215, cy + 55), PURPLE, (cx + 130, cy + 105))
    draw_letter_a(draw, cx - 120, cy - 5, scale=1.35)
    draw_han_wen(draw, cx + 120, cy - 5, scale=1.25)
    draw.polygon([(cx - 20, cy - 5), (cx + 20, cy - 5), (cx, cy + 32)], fill=BG)
    draw.line([(cx - 28, cy + 2), (cx + 28, cy + 2)], fill=SLATE, width=6)
    return im


def icon_language() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2

    draw_soft_blob(draw, cx, cy, 185, 175, TEAL_SOFT)
    draw_shadow_oval(draw, cx, cy + 10, 125, 55, offset=(10, 14))
    draw.rounded_rectangle([cx - 145, cy - 55, cx + 145, cy + 65], radius=48, fill=ACCENT, outline=INK, width=5)
    draw.ellipse([cx - 38, cy - 95, cx + 38, cy + 95], fill=PAPER, outline=INK, width=4)
    draw.line([(cx - 38, cy - 95), (cx - 38, cy + 95)], fill=INK, width=5)
    draw.arc([cx - 10, cy - 30, cx + 50, cy + 30], start=270, end=90, fill=INK, width=6)
    return im


def icon_knowledge() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 15

    draw_soft_blob(draw, cx, cy + 20, 190, 170, lighten(GOLD, 0.6))
    draw_shadow_oval(draw, cx, cy + 55, 125, 35, offset=(10, 12))
    draw.ellipse([cx - 105, cy - 95, cx + 105, cy + 55], fill=GOLD, outline=INK, width=5)
    draw.rectangle([cx - 135, cy + 30, cx + 135, cy + 58], fill=GOLD_DARK, outline=INK, width=4)
    draw.ellipse([cx - 16, cy - 25, cx + 16, cy + 8], fill=INK)
    draw.polygon([(cx - 90, cy - 110), (cx + 90, cy - 110), (cx, cy - 155)], fill=GOLD_LIGHT, outline=INK, width=3)
    for ox in (-70, 70):
        draw.ellipse([cx + ox - 10, cy - 125, cx + ox + 10, cy - 105], fill=GOLD_LIGHT, outline=INK, width=2)
    return im


def icon_dictionary() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2

    draw_soft_blob(draw, cx, cy, 195, 175, TEAL_SOFT)
    draw_shadow_oval(draw, cx + 15, cy + 15, 120, 130, offset=(12, 14))
    draw.rounded_rectangle([cx - 125, cy - 100, cx + 15, cy + 110], radius=10, fill=ACCENT, outline=INK, width=5)
    draw.rounded_rectangle([cx - 15, cy - 100, cx + 125, cy + 110], radius=10, fill=PURPLE, outline=INK, width=5)
    for y in range(cy - 55, cy + 75, 30):
        draw.line([(cx - 90, y), (cx + 90, y)], fill=PAPER, width=5)
    draw.line([(cx, cy - 100), (cx, cy + 110)], fill=INK, width=6)
    return im


def icon_frequency() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2

    draw_soft_blob(draw, cx, cy, 200, 175, BLUE_SOFT)
    pts: list[tuple[int, int]] = []
    x0, x1 = cx - 185, cx + 185
    for x in range(x0, x1 + 1, 4):
        y = cy + int(100 * math.sin((x - x0) * 2 * math.pi / 120))
        pts.append((x, y))
    draw.line([(p[0] + 6, p[1] + 8) for p in pts], fill=SHADOW, width=20)
    draw.line(pts, fill=BLUE, width=18)
    draw.line(pts, fill=lighten(BLUE, 0.35), width=8)
    for ox in (-165, 165):
        draw.ellipse([cx + ox - 28, cy - 28, cx + ox + 28, cy + 28], fill=ACCENT, outline=INK, width=4)
    return im


def icon_uncertainty() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 50

    draw_soft_blob(draw, cx, cy + 40, 195, 165, lighten(ACCENT, 0.55))
    draw.ellipse([cx - 28, cy - 155, cx + 28, cy - 85], fill=ACCENT, outline=INK, width=5)
    draw.rounded_rectangle([cx - 24, cy - 85, cx + 24, cy - 25], radius=8, fill=ACCENT)
    draw.ellipse([cx - 32, cy - 15, cx + 32, cy + 35], fill=ACCENT, outline=INK, width=4)

    fork_y = cy + 55
    draw.line([(cx + 8, fork_y + 8), (cx + 8, fork_y + 105)], fill=SHADOW, width=20)
    draw.line([(cx, fork_y), (cx, fork_y + 95)], fill=SLATE, width=18)
    draw.line([(cx + 8, fork_y + 45), (cx - 125 + 8, fork_y + 130)], fill=SHADOW, width=18)
    draw.line([(cx, fork_y + 38), (cx - 125, fork_y + 122)], fill=SLATE, width=18)
    draw.line([(cx + 8, fork_y + 45), (cx + 125 + 8, fork_y + 130)], fill=SHADOW, width=18)
    draw.line([(cx, fork_y + 38), (cx + 125, fork_y + 122)], fill=SLATE, width=18)
    draw.ellipse([cx - 145, fork_y + 100, cx - 95, fork_y + 150], fill=ACCENT, outline=INK, width=4)
    draw.ellipse([cx + 95, fork_y + 100, cx + 145, fork_y + 150], fill=CORAL, outline=INK, width=4)
    return im


def icon_expectation() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2

    draw_soft_blob(draw, cx, cy + 15, 195, 175, lighten(GOLD, 0.55))
    for r, color, w in [(115, SLATE, 10), (82, ACCENT, 10), (50, GOLD, 12)]:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=w)
    draw.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=CORAL, outline=INK, width=3)

    bx, by = cx + 95, cy - 30
    draw.rounded_rectangle([bx - 55, by - 35, bx + 55, by + 35], radius=18, fill=SLATE, outline=INK, width=4)
    draw.ellipse([bx - 38, by - 18, bx - 12, by + 8], fill=PAPER, outline=INK, width=3)
    draw.ellipse([bx + 12, by - 18, bx + 38, by + 8], fill=PAPER, outline=INK, width=3)
    draw.line([(bx - 48, by - 5), (bx - 22, by - 5)], fill=INK, width=5)
    draw.line([(bx + 22, by - 5), (bx + 48, by - 5)], fill=INK, width=5)

    draw_up_arrow(draw, tip=(cx, cy - 150), tail=(cx, cy - 55), color=GREEN_BRIGHT, shaft_w=26, head_w=50, head_h=56)
    return im


def icon_disclose() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 15

    draw_soft_blob(draw, cx, cy + 25, 190, 165, TEAL_SOFT)
    draw_shadow_oval(draw, cx, cy + 45, 115, 130, offset=(12, 16))
    draw.rounded_rectangle(
        [cx - 125, cy - 15, cx + 125, cy + 135],
        radius=18,
        fill=PAPER,
        outline=INK,
        width=5,
    )
    draw.polygon([(cx - 105, cy - 15), (cx + 105, cy - 15), (cx, cy - 115)], fill=ACCENT, outline=INK, width=4)
    draw.polygon([(cx - 38, cy - 15), (cx, cy - 115), (cx + 38, cy - 15)], fill=PAPER, outline=INK, width=3)
    for y in range(cy + 15, cy + 105, 26):
        draw.line([(cx - 85, y), (cx + 85, y)], fill=lighten(SLATE, 0.7), width=5)
    draw.ellipse([cx - 65, cy + 15, cx + 65, cy + 85], fill=BG, outline=ACCENT, width=5)
    draw.ellipse([cx - 26, cy + 35, cx - 6, cy + 55], fill=INK)
    draw.ellipse([cx + 6, cy + 35, cx + 26, cy + 55], fill=INK)
    draw.arc([cx - 35, cy + 52, cx + 35, cy + 82], start=15, end=165, fill=INK, width=5)
    draw.line([(cx - 95, cy - 55), (cx + 95, cy + 125)], fill=lighten(ACCENT, 0.35), width=8)
    return im


def main() -> None:
    icons = [
        ("revenue.png", icon_revenue),
        ("venture.png", icon_venture),
        ("company.png", icon_company),
        ("investment.png", icon_investment),
        ("market.png", icon_market),
        ("learning.png", icon_learning),
        ("translation.png", icon_translation),
        ("language.png", icon_language),
        ("knowledge.png", icon_knowledge),
        ("dictionary.png", icon_dictionary),
        ("frequency.png", icon_frequency),
        ("uncertainty.png", icon_uncertainty),
        ("expectation.png", icon_expectation),
        ("disclose.png", icon_disclose),
    ]
    for filename, factory in icons:
        save(filename, factory())


if __name__ == "__main__":
    main()
