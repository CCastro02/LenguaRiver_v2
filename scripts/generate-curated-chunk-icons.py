"""
Generate curated flat PNG icons for bundled lesson chunk images.
Run from LenguaRiver/:  python scripts/generate-curated-chunk-icons.py
"""
from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

SIZE = 512
BG = (244, 244, 242)
ACCENT = (13, 148, 136)
SLATE = (71, 85, 105)
WOOD = (167, 120, 84)
WOOD_DARK = (120, 82, 55)
CORAL = (231, 111, 81)
CHILI = (220, 38, 38)
ONION = (180, 160, 190)
STEM = (74, 124, 42)
RECEIPT = (255, 255, 252)
RED = (200, 40, 50)


def new_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(im)
    pad = 16
    r = 48
    draw.rounded_rectangle(
        [pad, pad, SIZE - pad, SIZE - pad],
        radius=r,
        fill=BG,
        outline=SLATE,
        width=4,
    )
    return im, draw


def out_path(name: str) -> str:
    return os.path.join(
        os.path.dirname(__file__), "..", "public", "images", "chunks", name
    )


def save(name: str, image: Image.Image) -> None:
    p = out_path(name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    image.save(p, "PNG")
    print("wrote", p)


def icon_quiero() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 10
    r = 72
    left_cx, right_cx = cx - 42, cx + 42
    cy_top = cy - 35
    draw.ellipse(
        [left_cx - r, cy_top - r, left_cx + r, cy_top + r], fill=CORAL, outline=SLATE, width=3
    )
    draw.ellipse(
        [right_cx - r, cy_top - r, right_cx + r, cy_top + r], fill=CORAL, outline=SLATE, width=3
    )
    draw.polygon(
        [(cx - 95, cy_top + 10), (cx + 95, cy_top + 10), (cx, cy + 110)],
        fill=CORAL,
        outline=SLATE,
        width=3,
    )
    return im


def icon_mesa() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    top_w, top_h = 260, 48
    y_top = 180
    pts = [
        (cx - top_w // 2, y_top),
        (cx + top_w // 2, y_top),
        (cx + top_w // 2 - 40, y_top + top_h),
        (cx - top_w // 2 + 40, y_top + top_h),
    ]
    draw.polygon(pts, fill=WOOD, outline=SLATE, width=3)

    leg_w, leg_h = 22, 120
    foot_y = y_top + top_h
    # front legs (narrower gap), back legs
    xs = [cx - 108, cx - 50, cx + 28, cx + 86]
    for x in xs:
        draw.rectangle([x, foot_y, x + leg_w, foot_y + leg_h], fill=WOOD_DARK, outline=SLATE, width=2)
    return im


def icon_menu() -> Image.Image:
    im, draw = new_canvas()
    x0, y0 = 140, 120
    x1, y1 = SIZE - 140, SIZE - 120
    draw.rounded_rectangle([x0, y0, x1, y1], radius=12, fill=RECEIPT, outline=SLATE, width=4)

    line_y = y0 + 55
    gap = 36
    for i in range(5):
        ly = line_y + i * gap
        w = (x1 - x0 - 80) if i < 3 else (x1 - x0 - 140)
        color = ACCENT if i == 0 else (220, 220, 215)
        draw.rectangle([x0 + 40, ly, x0 + 40 + w, ly + 10], fill=color)
    return im


def icon_sin_cebolla() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 10
    draw.ellipse([cx - 90, cy - 100, cx + 90, cy + 90], fill=ONION, outline=SLATE, width=3)
    for dx, tilt in [(-40, -10), (0, 0), (40, 10)]:
        draw.line(
            [(cx + dx, cy - 100), (cx + dx + tilt, cy - 138)],
            fill=STEM,
            width=8,
        )

    m = 40
    draw.line([(cx - 130 + m, cy - 130 + m), (cx + 130 - m, cy + 130 - m)], fill=RED, width=22)
    draw.line([(cx + 130 - m, cy - 130 + m), (cx - 130 + m, cy + 130 - m)], fill=RED, width=22)
    return im


def icon_picante() -> Image.Image:
    im, draw = new_canvas()
    pts: list[tuple[float, float]] = []
    for t in range(0, 38):
        u = (t / 37) * math.pi
        px = SIZE // 2 + 110 * math.cos(u) * (0.52 + 0.07 * math.sin(3 * u))
        py = SIZE // 2 + 28 * math.sin(u) + 42 * math.sin(u * 2)
        pts.append((px, py))
    draw.polygon([(int(p[0]), int(p[1])) for p in pts], fill=CHILI, outline=SLATE, width=3)
    draw.rectangle([SIZE // 2 - 10, 118, SIZE // 2 + 10, 178], fill=STEM, outline=SLATE, width=2)
    draw.polygon(
        [
            (SIZE // 2 + 88, SIZE // 2 - 28),
            (SIZE // 2 + 120, SIZE // 2 + 22),
            (SIZE // 2 + 52, SIZE // 2 + 10),
        ],
        fill=(255, 180, 60),
        outline=SLATE,
        width=2,
    )
    return im


def icon_agua() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 20
    draw.ellipse([cx - 70, cy - 120, cx + 70, cy + 80], fill=(100, 180, 220), outline=SLATE, width=4)
    draw.polygon(
        [(cx, cy - 120), (cx - 70, cy - 20), (cx + 70, cy - 20)],
        fill=(80, 165, 210),
        outline=SLATE,
        width=3,
    )
    draw.ellipse([cx - 28, cy - 50, cx - 8, cy - 25], fill=(200, 230, 255))
    return im


def icon_arroz() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 30
    draw.ellipse([cx - 110, cy - 50, cx + 110, cy + 70], fill=(250, 248, 240), outline=SLATE, width=4)
    draw.ellipse([cx - 95, cy - 35, cx + 95, cy + 55], fill=(245, 240, 220))
    for i in range(12):
        ox = (i % 4) * 38 - 57
        oy = (i // 4) * 22 - 20
        draw.ellipse([cx + ox, cy + oy, cx + ox + 14, cy + oy + 10], fill=(230, 225, 200))
    return im


def icon_sopa() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 40
    draw.ellipse([cx - 120, cy - 30, cx + 120, cy + 80], fill=(220, 225, 230), outline=SLATE, width=4)
    draw.ellipse([cx - 100, cy - 10, cx + 100, cy + 60], fill=(200, 120, 60))
    for dx, dy in [(-30, -70), (0, -90), (30, -70)]:
        draw.ellipse([cx + dx - 18, cy + dy, cx + dx + 18, cy + dy + 50], fill=(200, 200, 195))
    return im


def icon_pollo() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2
    draw.polygon(
        [(cx - 40, cy + 80), (cx + 90, cy + 20), (cx + 60, cy - 60), (cx - 20, cy - 40)],
        fill=(230, 180, 100),
        outline=SLATE,
        width=3,
    )
    draw.ellipse([cx - 70, cy + 50, cx + 30, cy + 120], fill=(220, 165, 90), outline=SLATE, width=3)
    draw.rectangle([cx - 10, cy - 100, cx + 10, cy - 50], fill=WOOD_DARK, outline=SLATE, width=2)
    return im


def icon_salsa() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    draw.rounded_rectangle([cx - 50, 130, cx + 50, 340], radius=16, fill=(200, 50, 40), outline=SLATE, width=4)
    draw.ellipse([cx - 70, 100, cx + 70, 180], fill=(200, 50, 40), outline=SLATE, width=3)
    draw.rectangle([cx - 18, 80, cx + 18, 130], fill=SLATE)
    draw.ellipse([cx - 90, 320, cx + 90, 400], fill=(200, 50, 40), outline=SLATE, width=3)
    return im


def icon_habitacion() -> Image.Image:
    im, draw = new_canvas()
    draw.rectangle([100, 200, SIZE - 100, 380], fill=(230, 228, 220), outline=SLATE, width=4)
    draw.rectangle([130, 280, SIZE - 130, 380], fill=WOOD)
    draw.rectangle([160, 300, SIZE - 160, 360], fill=(255, 252, 248), outline=SLATE, width=2)
    draw.polygon([(SIZE // 2, 140), (90, 210), (SIZE - 90, 210)], fill=CORAL, outline=SLATE, width=3)
    return im


def icon_pasaporte() -> Image.Image:
    im, draw = new_canvas()
    x0, y0 = 150, 120
    x1, y1 = SIZE - 150, SIZE - 100
    draw.rounded_rectangle([x0, y0, x1, y1], radius=14, fill=(30, 60, 120), outline=SLATE, width=4)
    draw.ellipse([x0 + 50, y0 + 60, x0 + 130, y0 + 140], fill=(255, 220, 80), outline=SLATE, width=2)
    for i in range(4):
        draw.rectangle([x0 + 160, y0 + 50 + i * 35, x1 - 40, y0 + 65 + i * 35], fill=(50, 90, 150))
    return im


def icon_desayuno() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    draw.ellipse([cx - 80, 260, cx + 80, 340], fill=(250, 248, 242), outline=SLATE, width=3)
    draw.rectangle([cx - 55, 200, cx + 55, 270], fill=(180, 120, 70), outline=SLATE, width=3)
    draw.arc([cx - 60, 170, cx + 60, 230], 20, 160, fill=(120, 80, 50), width=6)
    draw.ellipse([cx + 90, 240, cx + 150, 300], fill=(100, 180, 220), outline=SLATE, width=3)
    return im


def icon_desayuno_incluido() -> Image.Image:
    im, draw = new_canvas()
    base = icon_desayuno()
    im.paste(base)
    draw = ImageDraw.Draw(im)
    cx, cy = SIZE - 130, 130
    draw.ellipse([cx - 50, cy - 50, cx + 50, cy + 50], fill=ACCENT, outline=SLATE, width=3)
    draw.line([(cx - 20, cy), (cx - 5, cy + 22), (cx + 28, cy - 22)], fill=(255, 255, 255), width=10)
    return im


def icon_llave() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2 - 20, SIZE // 2 - 40
    draw.ellipse([cx - 55, cy - 55, cx + 55, cy + 55], outline=SLATE, width=14)
    draw.ellipse([cx - 25, cy - 25, cx + 25, cy + 25], fill=BG)
    draw.rectangle([cx + 40, cy + 10, cx + 160, cy + 35], fill=(220, 180, 60), outline=SLATE, width=3)
    for i, w in enumerate([28, 22, 18]):
        draw.rectangle(
            [cx + 120 + i * 18, cy + 35, cx + 120 + i * 18 + w, cy + 75],
            fill=(220, 180, 60),
            outline=SLATE,
            width=2,
        )
    return im


def icon_escuela() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    draw.rectangle([120, 220, SIZE - 120, 400], fill=(240, 238, 232), outline=SLATE, width=4)
    draw.polygon([(cx, 120), (90, 230), (SIZE - 90, 230)], fill=ACCENT, outline=SLATE, width=3)
    for x in [170, 260, 350]:
        draw.rectangle([x, 260, x + 55, 330], fill=(180, 210, 230), outline=SLATE, width=2)
    draw.rectangle([cx - 35, 330, cx + 35, 400], fill=WOOD_DARK, outline=SLATE, width=2)
    return im


def icon_oficina() -> Image.Image:
    im, draw = new_canvas()
    draw.rectangle([140, 260, SIZE - 140, 380], fill=WOOD, outline=SLATE, width=4)
    draw.rectangle([200, 160, SIZE - 200, 270], fill=(50, 55, 65), outline=SLATE, width=4)
    draw.rectangle([220, 180, SIZE - 220, 250], fill=(120, 180, 220))
    draw.rectangle([SIZE // 2 - 30, 280, SIZE // 2 + 30, 320], fill=(80, 80, 85))
    return im


def icon_fotografia() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    draw.rounded_rectangle([cx - 110, 180, cx + 110, 340], radius=20, fill=(45, 50, 58), outline=SLATE, width=4)
    draw.ellipse([cx - 55, 220, cx + 55, 300], fill=(60, 65, 75), outline=SLATE, width=3)
    draw.ellipse([cx - 35, 240, cx + 35, 280], fill=(100, 180, 220), outline=SLATE, width=2)
    draw.rectangle([cx - 30, 150, cx + 30, 200], fill=(45, 50, 58), outline=SLATE, width=3)
    return im


def icon_estacion_tren() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    draw.rounded_rectangle([80, 200, SIZE - 80, 380], radius=24, fill=ACCENT, outline=SLATE, width=4)
    draw.rectangle([110, 230, SIZE - 110, 310], fill=(180, 210, 230))
    draw.polygon([(cx, 130), (70, 210), (SIZE - 70, 210)], fill=CORAL, outline=SLATE, width=3)
    draw.ellipse([120, 350, 170, 400], fill=(40, 40, 45), outline=SLATE, width=2)
    draw.ellipse([SIZE - 170, 350, SIZE - 120, 400], fill=(40, 40, 45), outline=SLATE, width=2)
    return im


def icon_semaforo() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    draw.rectangle([cx - 35, 120, cx + 35, 400], fill=(50, 55, 60), outline=SLATE, width=3)
    draw.ellipse([cx - 55, 140, cx + 55, 220], fill=RED, outline=SLATE, width=2)
    draw.ellipse([cx - 55, 230, cx + 55, 310], fill=(255, 200, 50), outline=SLATE, width=2)
    draw.ellipse([cx - 55, 320, cx + 55, 400], fill=STEM, outline=SLATE, width=2)
    return im


def icon_esquina() -> Image.Image:
    im, draw = new_canvas()
    cx, cy = SIZE // 2, SIZE // 2 + 20
    draw.polygon([(cx - 140, cy + 100), (cx + 140, cy + 100), (cx + 140, cy - 80)], fill=(200, 200, 195), outline=SLATE, width=3)
    draw.polygon([(cx - 140, cy + 100), (cx - 140, cy - 80), (cx + 40, cy - 80)], fill=(215, 215, 210), outline=SLATE, width=3)
    draw.rectangle([cx - 20, cy - 120, cx + 20, cy - 40], fill=ACCENT, outline=SLATE, width=3)
    draw.polygon([(cx - 8, cy - 130), (cx + 8, cy - 130), (cx, cy - 150)], fill=ACCENT)
    return im


def icon_cafe() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    draw.ellipse([cx - 90, 240, cx + 90, 320], fill=(250, 248, 242), outline=SLATE, width=4)
    draw.rectangle([cx - 70, 180, cx + 70, 250], fill=(120, 75, 45), outline=SLATE, width=3)
    draw.arc([cx - 95, 200, cx + 130, 280], 270, 430, fill=SLATE, width=8)
    draw.ellipse([cx - 50, 200, cx + 50, 240], fill=(80, 50, 30))
    for dx, dy in [(-25, 150), (0, 130), (25, 150)]:
        draw.ellipse([cx + dx - 12, dy, cx + dx + 12, dy + 40], fill=(200, 200, 195))
    return im


def icon_senderismo() -> Image.Image:
    im, draw = new_canvas()
    cx = SIZE // 2
    draw.polygon([(80, 360), (cx, 140), (SIZE - 80, 360)], fill=(120, 160, 110), outline=SLATE, width=3)
    draw.polygon([(cx - 30, 360), (cx, 200), (cx + 80, 360)], fill=(90, 130, 90))
    draw.ellipse([cx - 40, 300, cx + 20, 380], fill=(80, 55, 40), outline=SLATE, width=3)
    draw.rectangle([cx + 30, 250, cx + 45, 340], fill=WOOD_DARK, outline=SLATE, width=2)
    return im


def icon_reserva() -> Image.Image:
    im, draw = new_canvas()
    x0, y0 = 130, 110
    x1, y1 = SIZE - 130, SIZE - 110
    draw.rounded_rectangle([x0, y0, x1, y1], radius=12, fill=RECEIPT, outline=SLATE, width=4)
    for i in range(5):
        ly = y0 + 40 + i * 38
        w = (x1 - x0 - 80) if i < 2 else (x1 - x0 - 120)
        draw.rectangle([x0 + 40, ly, x0 + 40 + w, ly + 12], fill=(210, 210, 205) if i > 0 else ACCENT)
    draw.ellipse([x1 - 90, y0 + 30, x1 - 30, y0 + 90], fill=ACCENT, outline=SLATE, width=2)
    draw.line([(x1 - 78, y0 + 55), (x1 - 62, y0 + 72), (x1 - 42, y0 + 48)], fill=(255, 255, 255), width=6)
    return im


def icon_vista() -> Image.Image:
    im, draw = new_canvas()
    draw.rectangle([100, 140, SIZE - 100, 380], fill=(200, 225, 240), outline=SLATE, width=4)
    draw.rectangle([120, 160, SIZE - 120, 360], fill=(130, 190, 230))
    draw.polygon([(80, 380), (SIZE - 80, 380), (SIZE - 80, 260), (80, 200)], fill=WOOD, outline=SLATE, width=3)
    draw.polygon([(140, 300), (200, 220), (280, 280), (360, 200), (SIZE - 140, 300)], fill=(90, 150, 90))
    draw.ellipse([220, 180, 300, 230], fill=(255, 220, 100))
    return im


def icon_cuenta() -> Image.Image:
    im, draw = new_canvas()
    x0, top = 130, 110
    x1 = SIZE - 130
    wave_y = SIZE - 150
    tooth = 18
    zig: list[tuple[float, float]] = [(x0, top), (x1, top), (x1, wave_y)]
    x = float(x1)
    toggle = True
    while x > x0:
        nx = max(float(x0), x - tooth)
        zig.append((nx, wave_y + (tooth if toggle else 0)))
        x = nx
        toggle = not toggle
    zig.append((x0, wave_y))
    draw.polygon([(int(a), int(b)) for a, b in zig], fill=RECEIPT, outline=SLATE, width=3)

    ly0 = top + 40
    for i in range(6):
        w = (x1 - x0 - 70) - (25 * (i % 3))
        draw.rectangle([x0 + 35, ly0 + i * 32, x0 + 35 + w, ly0 + i * 32 + 12], fill=(210, 210, 205))

    draw.rectangle([x0 + 35, wave_y - 52, x1 - 35, wave_y - 20], fill=ACCENT, outline=SLATE, width=2)
    return im


def main() -> None:
    icons = [
        ("quiero.png", icon_quiero),
        ("mesa.png", icon_mesa),
        ("menu.png", icon_menu),
        ("sin-cebolla.png", icon_sin_cebolla),
        ("picante.png", icon_picante),
        ("cuenta.png", icon_cuenta),
        ("agua.png", icon_agua),
        ("arroz.png", icon_arroz),
        ("sopa.png", icon_sopa),
        ("pollo.png", icon_pollo),
        ("salsa.png", icon_salsa),
        ("habitacion.png", icon_habitacion),
        ("pasaporte.png", icon_pasaporte),
        ("desayuno.png", icon_desayuno),
        ("desayuno-incluido.png", icon_desayuno_incluido),
        ("llave.png", icon_llave),
        ("escuela.png", icon_escuela),
        ("oficina.png", icon_oficina),
        ("fotografia.png", icon_fotografia),
        ("estacion-tren.png", icon_estacion_tren),
        ("semaforo.png", icon_semaforo),
        ("esquina.png", icon_esquina),
        ("cafe.png", icon_cafe),
        ("senderismo.png", icon_senderismo),
        ("reserva.png", icon_reserva),
        ("vista.png", icon_vista),
    ]
    for name, fn in icons:
        save(name, fn())


if __name__ == "__main__":
    main()
