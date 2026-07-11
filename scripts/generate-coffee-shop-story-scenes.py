"""
Generate multi-panel comic storybook pages for Coffee Shop lesson storyboards.
LenguaRiver house style: sketchy ink, warm muted washes, 2–3 panels per scene image.
Readable at ~360px display height (1024×576 source).

Run from LenguaRiver/:  python scripts/generate-coffee-shop-story-scenes.py
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable, Literal

from PIL import Image, ImageDraw, ImageFont

W, H = 1024, 576
GUTTER = 8
PAGE_MARGIN = 10

# Off-white paper + warm café washes
PAPER = (252, 248, 240)
PAPER_GRAIN = (245, 238, 228)
INK = (42, 32, 28)
INK_LIGHT = (88, 72, 58)
WALL_WASH = (232, 210, 188)
WALL_DEEP = (210, 178, 152)
FLOOR_WASH = (196, 168, 138)
FLOOR_TILE = (178, 148, 118)
WINDOW_SKY = (168, 198, 228)
WINDOW_FRAME = (118, 88, 62)
COUNTER_WOOD = (128, 88, 58)
COUNTER_TOP = (168, 128, 92)
TABLE_WOOD = (162, 118, 78)
CHAIR_WOOD = (148, 108, 72)
PLANT = (72, 128, 82)
PLANT_POT = (168, 102, 62)
LEARNER_SHIRT = (58, 142, 128)
LEARNER_PANTS = (72, 88, 108)
STRANGER_SHIRT = (196, 108, 78)
STRANGER_PANTS = (98, 78, 68)
SKIN = (228, 188, 152)
HAIR_DARK = (48, 38, 34)
HAIR_LIGHT = (138, 98, 62)
CUP = (248, 242, 232)
COFFEE = (92, 58, 38)
HATCH = (120, 100, 82)
ATTENTION = (192, 88, 58)
ATTENTION_SOFT = (168, 128, 88)
DOOR_WASH = (188, 158, 128)
BUBBLE_FILL = (255, 252, 246)
BUBBLE_OUTLINE = (42, 32, 28)
BUBBLE_STRONG_OUTLINE = (168, 72, 42)
CAPTION_FILL = (248, 242, 228)

HintLevel = Literal["strong", "medium", "light"]
BubbleStyle = Literal["speech", "thought", "caption"]
Speaker = Literal["learner", "stranger", "narration"]
Role = Literal["learner", "stranger"]
Expression = Literal["neutral", "happy", "curious", "surprised", "warm"]
LayoutName = Literal["three_strip", "two_plus_one", "four_grid", "wide_top"]
PanelPainter = Callable[["PanelContext"], None]
SceneFn = Callable[[ImageDraw.ImageDraw, random.Random], None]


@dataclass(frozen=True)
class PanelRect:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0


class PanelContext:
    """Panel-local coordinates: origin top-left of panel, scale from panel height."""

    def __init__(self, draw: ImageDraw.ImageDraw, rng: random.Random, rect: PanelRect, hint: HintLevel):
        self.draw = draw
        self.rng = rng
        self.rect = rect
        self.hint = hint
        self.ox = rect.x0
        self.oy = rect.y0
        self.pw = rect.w
        self.ph = rect.h
        # Boost scale so figures read clearly when the page is shown ~360px tall.
        self.scale = max(0.78, min(1.22, self.ph / 340))

    def lx(self, rel: float) -> float:
        return self.ox + self.pw * rel

    def ly(self, rel: float) -> float:
        return self.oy + self.ph * rel

    def feet_y(self) -> float:
        return self.oy + self.ph - 10

    def box(self, x0r: float, y0r: float, x1r: float, y1r: float) -> tuple[float, float, float, float]:
        return (self.lx(x0r), self.ly(y0r), self.lx(x1r), self.ly(y1r))


def _seed(*parts: str) -> int:
    h = hashlib.md5("|".join(parts).encode()).hexdigest()
    return int(h[:8], 16)


def jitter_point(
    x: float, y: float, amount: float, rng: random.Random
) -> tuple[float, float]:
    return (x + rng.uniform(-amount, amount), y + rng.uniform(-amount, amount))


def jittered_line(
    draw: ImageDraw.ImageDraw,
    p0: tuple[float, float],
    p1: tuple[float, float],
    *,
    segments: int = 6,
    jitter: float = 2.5,
    fill: tuple[int, int, int] = INK,
    width: int = 4,
    rng: random.Random,
) -> None:
    pts = [p0]
    for i in range(1, segments):
        t = i / segments
        mx = p0[0] + (p1[0] - p0[0]) * t
        my = p0[1] + (p1[1] - p0[1]) * t
        pts.append(jitter_point(mx, my, jitter, rng))
    pts.append(p1)
    for a, b in zip(pts[:-1], pts[1:]):
        draw.line([a, b], fill=fill, width=max(3, width))


def sketch_line(
    draw: ImageDraw.ImageDraw,
    p0: tuple[float, float],
    p1: tuple[float, float],
    *,
    rng: random.Random,
    width: int = 4,
    fill: tuple[int, int, int] = INK,
    wobble: float = 2.0,
    passes: int = 2,
) -> None:
    for _ in range(passes):
        jittered_line(
            draw, p0, p1, segments=5, jitter=wobble, fill=fill, width=max(2, width - 1), rng=rng
        )
    jittered_line(draw, p0, p1, segments=4, jitter=wobble * 0.5, fill=fill, width=width, rng=rng)


def _jittered_polygon(
    corners: list[tuple[float, float]], amount: float, rng: random.Random
) -> list[tuple[float, float]]:
    return [jitter_point(x, y, amount, rng) for x, y in corners]


def sketch_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    *,
    rng: random.Random,
    fill: tuple[int, int, int] | None = None,
    outline: tuple[int, int, int] = INK,
    jitter: float = 4.0,
    width: int = 4,
) -> None:
    x0, y0, x1, y1 = box
    poly = _jittered_polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], jitter, rng)
    if fill:
        draw.polygon(poly, fill=fill)
    for i in range(4):
        sketch_line(draw, poly[i], poly[(i + 1) % 4], rng=rng, width=width, fill=outline)


def sketch_ellipse(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    *,
    rng: random.Random,
    fill: tuple[int, int, int] | None = None,
    outline: tuple[int, int, int] = INK,
    segments: int = 14,
    jitter: float = 3.5,
    width: int = 4,
) -> None:
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    pts: list[tuple[float, float]] = []
    for i in range(segments):
        ang = 2 * math.pi * i / segments
        pts.append(jitter_point(cx + math.cos(ang) * rx, cy + math.sin(ang) * ry, jitter, rng))
    if fill:
        draw.polygon(pts, fill=fill)
    for i in range(segments):
        sketch_line(draw, pts[i], pts[(i + 1) % segments], rng=rng, width=width, fill=outline)


def hatch_area(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    *,
    rng: random.Random,
    color: tuple[int, int, int] = HATCH,
    spacing: int = 22,
    angle: float = 0.6,
) -> None:
    x0, y0, x1, y1 = box
    length = int(math.hypot(x1 - x0, y1 - y0) * 1.2)
    ox = math.cos(angle) * spacing
    oy = math.sin(angle) * spacing
    x, y = x0 - 20, y0
    count = 0
    max_lines = 6
    while y < y1 + 30 and count < max_lines:
        p0 = jitter_point(x, y, 1.0, rng)
        p1 = jitter_point(x + length, y + length * math.tan(angle) * 0.25, 1.0, rng)
        draw.line([p0, p1], fill=color, width=2)
        x += ox
        y += oy
        count += 1


def draw_paper_texture(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    rng: random.Random,
    *,
    density: int = 40,
) -> None:
    x0, y0, x1, y1 = box
    for _ in range(density):
        x = rng.randint(int(x0), max(int(x0), int(x1) - 1))
        y = rng.randint(int(y0), max(int(y0), int(y1) - 1))
        draw.point((x, y), fill=PAPER_GRAIN)


def draw_panel_border(draw: ImageDraw.ImageDraw, panel: PanelRect, rng: random.Random) -> None:
    sketch_rect(
        draw,
        (panel.x0, panel.y0, panel.x1, panel.y1),
        rng=rng,
        fill=None,
        outline=INK,
        jitter=2.5,
        width=5,
    )


def draw_panel_layout(layout: LayoutName, rng: random.Random) -> list[PanelRect]:
    m = PAGE_MARGIN
    g = GUTTER
    inner_w = W - 2 * m
    inner_h = H - 2 * m

    if layout == "three_strip":
        pw = (inner_w - 2 * g) / 3
        return [
            PanelRect(m, m, m + pw, m + inner_h),
            PanelRect(m + pw + g, m, m + 2 * pw + g, m + inner_h),
            PanelRect(m + 2 * pw + 2 * g, m, m + inner_w, m + inner_h),
        ]

    if layout == "two_plus_one":
        big_w = inner_w * 0.52
        small_w = inner_w - big_w - g
        half_h = (inner_h - g) / 2
        return [
            PanelRect(m, m, m + big_w, m + inner_h),
            PanelRect(m + big_w + g, m, m + inner_w, m + half_h),
            PanelRect(m + big_w + g, m + half_h + g, m + inner_w, m + inner_h),
        ]

    if layout == "four_grid":
        pw = (inner_w - g) / 2
        ph = (inner_h - g) / 2
        return [
            PanelRect(m, m, m + pw, m + ph),
            PanelRect(m + pw + g, m, m + inner_w, m + ph),
            PanelRect(m, m + ph + g, m + pw, m + inner_h),
            PanelRect(m + pw + g, m + ph + g, m + inner_w, m + inner_h),
        ]

    # wide_top: one establishing panel + two below
    top_h = inner_h * 0.42
    bot_h = inner_h - top_h - g
    half_w = (inner_w - g) / 2
    return [
        PanelRect(m, m, m + inner_w, m + top_h),
        PanelRect(m, m + top_h + g, m + half_w, m + inner_h),
        PanelRect(m + half_w + g, m + top_h + g, m + inner_w, m + inner_h),
    ]


def draw_comic_page(
    draw: ImageDraw.ImageDraw,
    rng: random.Random,
    *,
    layout: LayoutName,
    hint: HintLevel,
    panels: list[PanelPainter],
) -> None:
    draw.rectangle([0, 0, W, H], fill=PAPER)
    draw_paper_texture(draw, (0, 0, W, H), rng, density=35)
    rects = draw_panel_layout(layout, rng)
    for rect, painter in zip(rects, panels):
        ctx = PanelContext(draw, rng, rect, hint)
        draw.rectangle([rect.x0, rect.y0, rect.x1, rect.y1], fill=PAPER)
        draw_paper_texture(draw, (rect.x0, rect.y0, rect.x1, rect.y1), rng, density=max(6, int(rect.w * rect.h / 18000)))
        painter(ctx)
    for rect in rects:
        draw_panel_border(draw, rect, rng)


# --- Dialogue bubbles (rendered into PNG) ---


@lru_cache(maxsize=32)
def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    windir = os.environ.get("WINDIR", r"C:\Windows")
    candidates = [
        os.path.join(windir, "Fonts", "comicbd.ttf" if bold else "comic.ttf"),
        os.path.join(windir, "Fonts", "segoeuib.ttf" if bold else "segoeui.ttf"),
        os.path.join(windir, "Fonts", "arialbd.ttf" if bold else "arial.ttf"),
        "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _font_for_hint(hint: HintLevel, emphasis: str) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if hint == "strong":
        size = 24 if emphasis == "strong" else 21
    elif hint == "medium":
        size = 20 if emphasis == "strong" else 18
    else:
        size = 17 if emphasis == "strong" else 15
    return _load_font(size, bold=emphasis == "strong" or hint == "strong")


def _text_width(text: str, font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> float:
    if hasattr(font, "getlength"):
        return float(font.getlength(text))
    return float(font.getsize(text)[0])


def _wrap_text(
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    max_width: float,
) -> list[str]:
    words = text.replace("\n", " ").split()
    if not words:
        return [""]
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        trial = " ".join([*current, word])
        if _text_width(trial, font) <= max_width or not current:
            current.append(word)
        else:
            lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines


def _resolve_position(speaker: str, position: str) -> str:
    if position and position != "auto":
        return position
    if speaker == "learner":
        return "top-left"
    if speaker == "stranger":
        return "top-right"
    return "top"


def _bubble_region(ctx: PanelContext, position: str) -> tuple[float, float, float, float]:
    pad = max(8.0, 10.0 * ctx.scale)
    top = ctx.oy + pad
    bottom = ctx.oy + ctx.ph * 0.38
    if position == "top-left":
        return (ctx.ox + pad, top, ctx.ox + ctx.pw * 0.64, bottom)
    if position == "top-right":
        return (ctx.ox + ctx.pw * 0.36, top, ctx.ox + ctx.pw - pad, bottom)
    if position in ("bottom-left", "bottom"):
        return (ctx.ox + pad, ctx.oy + ctx.ph * 0.58, ctx.ox + ctx.pw * 0.64, ctx.oy + ctx.ph - pad)
    if position == "bottom-right":
        return (ctx.ox + ctx.pw * 0.36, ctx.oy + ctx.ph * 0.58, ctx.ox + ctx.pw - pad, ctx.oy + ctx.ph - pad)
    return (ctx.ox + pad, top, ctx.ox + ctx.pw - pad, bottom)


def _bubble_scale(box: tuple[float, float, float, float]) -> float:
    return max(0.75, min(1.2, (box[3] - box[1]) / 120))


def _draw_speech_tail(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    *,
    speaker: str,
    rng: random.Random,
) -> None:
    x0, _y0, x1, y1 = box
    mid_x = (x0 + x1) / 2
    base_y = y1
    scale = _bubble_scale(box)
    if speaker == "learner":
        tip = (x0 + (x1 - x0) * 0.22, base_y + 16 * scale)
        anchor = (x0 + 14, base_y - 2)
    elif speaker == "stranger":
        tip = (x1 - (x1 - x0) * 0.22, base_y + 16 * scale)
        anchor = (x1 - 14, base_y - 2)
    else:
        tip = (mid_x, base_y + 14 * scale)
        anchor = (mid_x, base_y - 2)
    sketch_line(draw, anchor, jitter_point(tip[0], tip[1], 2.0, rng), rng=rng, width=3, fill=BUBBLE_OUTLINE)


def draw_panel_dialogue(ctx: PanelContext, dialogue: dict[str, Any]) -> None:
    text = str(dialogue.get("text", "")).strip()
    if not text:
        return
    speaker = str(dialogue.get("speaker", "narration"))
    bubble_style = str(dialogue.get("bubbleStyle", "speech"))
    emphasis = str(dialogue.get("emphasis", "normal"))
    position = _resolve_position(speaker, str(dialogue.get("position", "auto")))

    region = _bubble_region(ctx, position)
    rx0, ry0, rx1, ry1 = region
    inner_pad = max(10.0, 12.0 * ctx.scale)
    max_text_w = max(40.0, (rx1 - rx0) - inner_pad * 2)
    font = _font_for_hint(ctx.hint, emphasis)
    lines = _wrap_text(text, font, max_text_w)
    line_heights = [font.getbbox(line)[3] - font.getbbox(line)[1] + 4 for line in lines]
    text_h = sum(line_heights)
    text_w = max(_text_width(line, font) for line in lines)
    bubble_w = min(rx1 - rx0, text_w + inner_pad * 2)
    bubble_h = min(ry1 - ry0, text_h + inner_pad * 2)
    bx0 = rx0 if position.startswith("top-left") or position == "top" else rx1 - bubble_w
    by0 = ry0
    bx1 = bx0 + bubble_w
    by1 = by0 + bubble_h
    outline = BUBBLE_STRONG_OUTLINE if emphasis == "strong" else BUBBLE_OUTLINE
    outline_w = 4 if emphasis == "strong" and ctx.hint == "strong" else 3

    if bubble_style == "caption":
        ctx.draw.rounded_rectangle(
            [bx0, by0, bx1, by1], radius=6, fill=CAPTION_FILL, outline=outline, width=outline_w
        )
    elif bubble_style == "thought":
        ctx.draw.rounded_rectangle(
            [bx0, by0, bx1, by1], radius=18, fill=BUBBLE_FILL, outline=outline, width=outline_w
        )
        for ox, oy in ((-10, 12), (-16, 22)):
            r = 5 if oy > 15 else 7
            ctx.draw.ellipse(
                [bx0 + ox - r, by1 + oy - r, bx0 + ox + r, by1 + oy + r],
                fill=BUBBLE_FILL,
                outline=outline,
                width=2,
            )
    else:
        ctx.draw.rounded_rectangle(
            [bx0, by0, bx1, by1], radius=14, fill=BUBBLE_FILL, outline=outline, width=outline_w
        )
        _draw_speech_tail(ctx.draw, (bx0, by0, bx1, by1), speaker=speaker, rng=ctx.rng)

    ty = by0 + inner_pad
    for line, lh in zip(lines, line_heights):
        ctx.draw.text((bx0 + inner_pad, ty), line, fill=INK, font=font)
        ty += lh


def make_dialogue_panel_painter(visual: PanelPainter, dialogue: dict[str, Any] | None) -> PanelPainter:
    def painter(ctx: PanelContext) -> None:
        visual(ctx)
        if dialogue:
            draw_panel_dialogue(ctx, dialogue)

    return painter


@dataclass(frozen=True)
class SceneSpec:
    layout: LayoutName
    hint: HintLevel
    busy: bool
    visual_beats: list[str]
    panels: list[dict[str, Any]]


def _dialogue_json_path() -> str:
    return os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "lib", "coffee-shop-story-dialogue.json")
    )


@lru_cache(maxsize=1)
def load_scene_dialogue() -> dict[str, dict[str, dict[str, Any]]]:
    with open(_dialogue_json_path(), encoding="utf-8") as handle:
        return json.load(handle)


def scene_spec_for(tier: str, filename: str) -> SceneSpec:
    raw = load_scene_dialogue()[tier][filename]
    return SceneSpec(
        layout=raw["layout"],
        hint=raw["hint"],
        busy=bool(raw.get("busy", False)),
        visual_beats=list(raw["visualBeats"]),
        panels=list(raw.get("panels", [])),
    )


# --- Panel-scoped café & props ---


def draw_cup_scaled(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    *,
    rng: random.Random,
    scale: float = 1.0,
    highlight: bool = False,
) -> None:
    s = scale * 1.15
    w, h = 28 * s, 36 * s
    sketch_ellipse(draw, (cx - w, cy - h, cx + w, cy + h * 0.3), rng=rng, fill=CUP, width=2)
    sketch_rect(draw, (cx - w * 0.65, cy - h * 0.45, cx + w * 0.65, cy + h * 0.15), rng=rng, fill=COFFEE, width=2)
    sketch_line(draw, (cx + w, cy - h * 0.15), (cx + w * 1.35, cy + 4), rng=rng, width=2)
    if highlight:
        sketch_line(draw, (cx - w * 1.5, cy - h), (cx - w * 0.4, cy - h * 0.35), rng=rng, fill=ATTENTION, width=2, wobble=2.5)


def draw_cafe_panel(
    ctx: PanelContext,
    *,
    clutter: float = 0.5,
    busy: bool = False,
    show_counter: bool = True,
    show_table: bool = True,
    show_window: bool = True,
    show_door: bool = False,
) -> None:
    d, rng = ctx.draw, ctx.rng
    box = (ctx.ox, ctx.oy, ctx.ox + ctx.pw, ctx.oy + ctx.ph)
    sketch_rect(d, box, rng=rng, fill=WALL_WASH, jitter=6, width=2)
    floor_y = ctx.ly(0.72)
    tile_h = max(16, int(24 * ctx.scale))
    tile_w = max(44, int(58 * ctx.scale))
    for row, y in enumerate(range(int(floor_y), int(ctx.oy + ctx.ph), tile_h + 4)):
        for col, x in enumerate(range(int(ctx.ox), int(ctx.ox + ctx.pw), tile_w + 4)):
            fill = FLOOR_TILE if (row + col) % 2 else FLOOR_WASH
            sketch_rect(
                d,
                (x + 1, y + 1, x + tile_w, y + tile_h),
                rng=rng,
                fill=fill,
                jitter=2,
                width=1,
            )

    if show_window:
        sketch_rect(
            d,
            ctx.box(0.55, 0.06, 0.94, 0.42),
            rng=rng,
            fill=WINDOW_SKY,
            jitter=3,
            width=2,
        )
        wx0, wy0, wx1, wy1 = ctx.box(0.55, 0.06, 0.94, 0.42)
        sketch_line(d, ((wx0 + wx1) / 2, wy0), ((wx0 + wx1) / 2, wy1), rng=rng, width=2, fill=WINDOW_FRAME)
        if clutter >= 0.4:
            sketch_ellipse(d, (wx0 + 8, wy0 + 12, wx0 + 48, wy0 + 48), rng=rng, fill=(255, 248, 200), width=1)

    if show_door:
        sketch_rect(d, ctx.box(0.04, 0.12, 0.28, 0.68), rng=rng, fill=DOOR_WASH, jitter=5, width=2)
        sketch_ellipse(d, ctx.box(0.2, 0.42, 0.24, 0.48), rng=rng, fill=INK_LIGHT, jitter=2, width=1)

    if show_counter:
        sketch_rect(d, ctx.box(0.02, 0.38, 0.38, 0.68), rng=rng, fill=COUNTER_WOOD, jitter=5)
        sketch_rect(d, ctx.box(0.02, 0.34, 0.39, 0.4), rng=rng, fill=COUNTER_TOP, jitter=4)
        if clutter >= 0.5:
            cx, cy = ctx.lx(0.12), ctx.ly(0.36)
            draw_cup_scaled(d, cx, cy, rng=rng, scale=0.75 * ctx.scale)

    if show_table and clutter >= 0.3:
        tcx, ty = ctx.lx(0.52), ctx.ly(0.62)
        tw = 110 * ctx.scale
        sketch_rect(d, (tcx - tw / 2, ty, tcx + tw / 2, ty + 18 * ctx.scale), rng=rng, fill=TABLE_WOOD, jitter=4, width=3)

    if clutter >= 0.45:
        sketch_ellipse(d, ctx.box(0.42, 0.52, 0.56, 0.78), rng=rng, fill=PLANT, jitter=6)
        sketch_ellipse(d, ctx.box(0.45, 0.64, 0.53, 0.76), rng=rng, fill=PLANT_POT, jitter=4)

    if busy and clutter >= 0.65:
        for i, ox in enumerate((0.06, 0.12, 0.18)):
            sketch_ellipse(
                d,
                (ctx.lx(ox), ctx.ly(0.38 + i * 0.04), ctx.lx(ox + 0.05), ctx.ly(0.44 + i * 0.04)),
                rng=rng,
                fill=INK_LIGHT,
                jitter=3,
                width=1,
            )

    # Menu board shape — no readable text
    if clutter >= 0.35:
        sketch_rect(d, ctx.box(0.32, 0.1, 0.48, 0.28), rng=rng, fill=WALL_DEEP, jitter=4, width=2)


def draw_chair_panel(ctx: PanelContext, rel_x: float, *, empty: bool = False) -> None:
    cx = ctx.lx(rel_x)
    feet = ctx.feet_y()
    sketch_rect(
        ctx.draw,
        (cx - 32 * ctx.scale, feet - 58 * ctx.scale, cx + 32 * ctx.scale, feet - 22 * ctx.scale),
        rng=ctx.rng,
        fill=CHAIR_WOOD,
        jitter=4,
    )
    sketch_line(ctx.draw, (cx, feet - 22 * ctx.scale), (cx, feet), rng=ctx.rng, width=3, fill=CHAIR_WOOD)
    if empty:
        sketch_line(
            ctx.draw,
            (cx - 18, feet - 48 * ctx.scale),
            (cx + 18, feet - 48 * ctx.scale),
            rng=ctx.rng,
            width=2,
            fill=ATTENTION_SOFT,
        )


def draw_expression(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    *,
    rng: random.Random,
    expression: Expression,
    facing: Literal["left", "right"] = "right",
    scale: float = 1.0,
) -> None:
    s = scale
    flip = -1 if facing == "left" else 1
    for eye_dx in (-11 * s * flip, 11 * s * flip):
        exx = cx + eye_dx
        if expression in ("happy", "warm"):
            sketch_line(
                draw,
                (exx - 6 * s, cy - 3 * s),
                (exx + 6 * s, cy - 3 * s),
                rng=rng,
                width=2,
            )
        elif expression == "surprised":
            sketch_ellipse(draw, (exx - 5, cy - 6, exx + 5, cy + 3), rng=rng, fill=None, width=2)
        else:
            draw.ellipse([exx - 4, cy - 4, exx + 4, cy + 4], fill=INK)

    brow_y = cy - int(14 * s)
    if expression == "curious":
        sketch_line(draw, (cx - 16 * s, brow_y - 4), (cx - 5 * s, brow_y), rng=rng, width=2)
        sketch_line(draw, (cx + 5 * s, brow_y), (cx + 16 * s, brow_y - 3), rng=rng, width=2)
    elif expression == "surprised":
        sketch_line(draw, (cx - 18 * s, brow_y - 8), (cx - 6 * s, brow_y - 9), rng=rng, width=2)
        sketch_line(draw, (cx + 6 * s, brow_y - 9), (cx + 18 * s, brow_y - 8), rng=rng, width=2)

    my = cy + int(10 * s)
    if expression in ("happy", "warm"):
        sketch_line(draw, (cx - 10 * s, my), (cx, my + 6 * s), rng=rng, width=2)
        sketch_line(draw, (cx, my + 6 * s), (cx + 10 * s, my), rng=rng, width=2)
    elif expression == "curious":
        sketch_ellipse(draw, (cx - 6, my - 3, cx + 6, my + 7), rng=rng, fill=None, width=2)
    elif expression == "surprised":
        sketch_ellipse(draw, (cx - 8, my - 4, cx + 8, my + 8), rng=rng, fill=None, width=2)
    else:
        sketch_line(draw, (cx - 8 * s, my), (cx + 8 * s, my), rng=rng, width=2)


def draw_character_pose(
    ctx: PanelContext,
    rel_x: float,
    *,
    role: Role,
    facing: Literal["left", "right"] = "right",
    expression: Expression = "neutral",
    arm_up: bool = False,
    arm_out: bool = False,
    holding_cup: bool = False,
    lean: float = 0.0,
) -> None:
    d, rng = ctx.draw, ctx.rng
    s = ctx.scale * 1.18
    cx = ctx.lx(rel_x) + lean * 20
    feet = ctx.feet_y()
    flip = -1 if facing == "left" else 1
    shirt = LEARNER_SHIRT if role == "learner" else STRANGER_SHIRT
    pants = LEARNER_PANTS if role == "learner" else STRANGER_PANTS
    hair = HAIR_DARK if role == "learner" else HAIR_LIGHT

    sketch_ellipse(
        d,
        (cx - 36 * s, feet - 8, cx + 36 * s, feet + 6),
        rng=rng,
        fill=HATCH,
        jitter=3,
        width=2,
    )

    for dx in (-16 * s, 16 * s):
        sketch_line(d, (cx + dx, feet - 58 * s), (cx + dx * 1.08, feet), rng=rng, width=5, fill=pants)

    shoulder = 52 * s
    top_y = feet - 148 * s
    mid_y = feet - 56 * s
    torso = _jittered_polygon(
        [
            (cx - shoulder, mid_y),
            (cx + shoulder, mid_y),
            (cx + shoulder * 0.82 * flip, top_y + 28 * s),
            (cx - shoulder * 0.88, top_y + 24 * s),
        ],
        4,
        rng,
    )
    d.polygon(torso, fill=shirt)
    for i in range(4):
        sketch_line(d, torso[i], torso[(i + 1) % 4], rng=rng, width=2)

    shoulder_x = cx + 36 * s * flip
    hand_y = feet - 82 * s
    if arm_up:
        sketch_line(
            d,
            (shoulder_x, feet - 104 * s),
            (shoulder_x + 40 * s * flip, feet - 168 * s),
            rng=rng,
            width=6,
            fill=shirt,
        )
        sketch_ellipse(
            d,
            (
                shoulder_x + 34 * s * flip - 12,
                feet - 178 * s,
                shoulder_x + 50 * s * flip,
                feet - 152 * s,
            ),
            rng=rng,
            fill=SKIN,
            jitter=2,
            width=3,
        )
    elif arm_out:
        sketch_line(
            d,
            (shoulder_x, feet - 100 * s),
            (shoulder_x + 54 * s * flip, feet - 88 * s),
            rng=rng,
            width=5,
            fill=shirt,
        )
    else:
        sketch_line(d, (shoulder_x, feet - 100 * s), (shoulder_x + 28 * s * flip, hand_y), rng=rng, width=5, fill=shirt)
        if holding_cup:
            draw_cup_scaled(d, shoulder_x + 44 * s * flip, hand_y - 16, rng=rng, scale=0.95 * s)

    head_r = 34 * s
    head_cy = feet - 172 * s
    sketch_ellipse(
        d,
        (cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r),
        rng=rng,
        fill=SKIN,
        jitter=4,
        width=2,
    )
    hair_pts = _jittered_polygon(
        [
            (cx - head_r - 4, head_cy - head_r + 6),
            (cx + head_r + 3, head_cy - head_r + 5),
            (cx + head_r * 0.55, head_cy - head_r - 8),
            (cx - head_r * 0.48, head_cy - head_r - 10),
        ],
        3,
        rng,
    )
    d.polygon(hair_pts, fill=hair)
    for i in range(4):
        sketch_line(d, hair_pts[i], hair_pts[(i + 1) % 4], rng=rng, width=2, fill=INK)

    draw_expression(d, cx, head_cy, rng=rng, expression=expression, facing=facing, scale=s)


def draw_attention_marks(
    ctx: PanelContext,
    *,
    kind: Literal["point", "focus", "energy", "gentle"],
    x: float,
    y: float,
    tx: float | None = None,
    ty: float | None = None,
) -> None:
    d, rng = ctx.draw, ctx.rng
    if kind == "point" and tx is not None and ty is not None:
        for _ in range(3):
            sketch_line(d, (x, y), jitter_point(tx, ty, 6, rng), rng=rng, fill=ATTENTION, width=2, wobble=3)
        sketch_line(d, (tx - 12, ty - 12), (tx + 12, ty + 12), rng=rng, fill=ATTENTION, width=2)
        sketch_line(d, (tx - 12, ty + 12), (tx + 12, ty - 12), rng=rng, fill=ATTENTION, width=2)
    elif kind == "focus":
        sketch_ellipse(d, (x - 28, y - 22, x + 28, y + 22), rng=rng, fill=None, outline=ATTENTION, width=2)
    elif kind == "energy":
        for i in range(4):
            ang = i * 1.4 + rng.uniform(-0.15, 0.15)
            sketch_line(
                d,
                (x, y),
                (x + math.cos(ang) * 32, y + math.sin(ang) * 32),
                rng=rng,
                fill=ATTENTION,
                width=2,
            )
    else:
        sketch_ellipse(d, (x - 20, y - 16, x + 20, y + 16), rng=rng, fill=None, outline=ATTENTION_SOFT, width=2)


# --- Per-panel scene beats ---


def _hint_clutter(hint: HintLevel) -> float:
    if hint == "strong":
        return 0.28
    if hint == "medium":
        return 0.52
    return 0.78


def panel_arrival_establishing(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=0.2, show_counter=False, show_table=False, show_door=True)
    draw_character_pose(ctx, 0.72, role="learner", facing="left", expression="curious", arm_out=True)


def panel_arrival_notice(ctx: PanelContext) -> None:
    clutter = _hint_clutter(ctx.hint)
    draw_cafe_panel(ctx, clutter=clutter, show_counter=False, busy=ctx.hint == "light")
    draw_chair_panel(ctx, 0.58, empty=True)
    draw_character_pose(
        ctx,
        0.22,
        role="learner",
        facing="right",
        expression="curious",
        arm_up=ctx.hint == "strong",
        arm_out=ctx.hint == "medium",
    )
    if ctx.hint == "strong":
        draw_attention_marks(
            ctx,
            kind="point",
            x=ctx.lx(0.32),
            y=ctx.ly(0.45),
            tx=ctx.lx(0.58),
            ty=ctx.ly(0.58),
        )


def panel_arrival_approach(ctx: PanelContext) -> None:
    clutter = _hint_clutter(ctx.hint)
    draw_cafe_panel(ctx, clutter=clutter, busy=ctx.hint == "light")
    draw_chair_panel(ctx, 0.52, empty=False)
    draw_character_pose(
        ctx,
        0.28,
        role="learner",
        facing="right",
        expression="curious" if ctx.hint != "light" else "neutral",
        arm_out=ctx.hint != "light",
    )
    draw_character_pose(
        ctx,
        0.68,
        role="stranger",
        facing="left",
        expression="neutral",
        holding_cup=True,
    )
    if ctx.hint == "medium":
        draw_attention_marks(ctx, kind="gentle", x=ctx.lx(0.5), y=ctx.ly(0.42))


def panel_greeting_approach(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint))
    draw_character_pose(ctx, 0.32, role="learner", facing="right", expression="warm", arm_out=True)
    draw_character_pose(ctx, 0.72, role="stranger", facing="left", expression="neutral", holding_cup=True)


def panel_greeting_gesture(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint))
    draw_character_pose(
        ctx,
        0.38,
        role="learner",
        facing="right",
        expression="happy",
        arm_up=ctx.hint == "strong",
        holding_cup=ctx.hint != "strong",
    )
    draw_character_pose(ctx, 0.68, role="stranger", facing="left", expression="happy", holding_cup=True)
    if ctx.hint == "strong":
        draw_attention_marks(ctx, kind="energy", x=ctx.lx(0.48), y=ctx.ly(0.35))


def panel_greeting_response(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint), busy=ctx.hint == "light")
    draw_character_pose(
        ctx,
        0.35,
        role="learner",
        facing="right",
        expression="happy" if ctx.hint != "light" else "warm",
        holding_cup=True,
    )
    draw_character_pose(
        ctx,
        0.68,
        role="stranger",
        facing="left",
        expression="happy" if ctx.hint != "light" else "warm",
        arm_up=ctx.hint == "strong",
        holding_cup=True,
    )
    if ctx.hint == "medium":
        draw_attention_marks(ctx, kind="gentle", x=ctx.lx(0.52), y=ctx.ly(0.38))


def panel_ordering_setup(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=0.35, show_table=True, show_counter=True)
    draw_cup_scaled(ctx.draw, ctx.lx(0.14), ctx.ly(0.34), rng=ctx.rng, scale=0.85 * ctx.scale)
    draw_cup_scaled(ctx.draw, ctx.lx(0.22), ctx.ly(0.34), rng=ctx.rng, scale=0.85 * ctx.scale)


def panel_ordering_gesture(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint))
    draw_character_pose(
        ctx,
        0.26,
        role="learner",
        facing="right",
        expression="curious",
        holding_cup=True,
        arm_out=ctx.hint == "strong",
    )
    draw_cup_scaled(
        ctx.draw,
        ctx.lx(0.48),
        ctx.ly(0.55),
        rng=ctx.rng,
        scale=ctx.scale,
        highlight=ctx.hint == "strong",
    )
    if ctx.hint == "strong":
        draw_attention_marks(
            ctx,
            kind="point",
            x=ctx.lx(0.38),
            y=ctx.ly(0.48),
            tx=ctx.lx(0.48),
            ty=ctx.ly(0.52),
        )


def panel_ordering_reaction(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint))
    draw_character_pose(ctx, 0.32, role="learner", facing="right", expression="warm", holding_cup=True)
    draw_character_pose(
        ctx,
        0.7,
        role="stranger",
        facing="left",
        expression="happy",
        holding_cup=True,
    )


def panel_clarify_confused(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint))
    draw_character_pose(
        ctx,
        0.38,
        role="learner",
        facing="right",
        expression="curious" if ctx.hint != "light" else "neutral",
    )
    draw_character_pose(
        ctx,
        0.72,
        role="stranger",
        facing="left",
        expression="surprised" if ctx.hint == "strong" else "neutral",
    )


def panel_clarify_gesture(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint))
    draw_character_pose(
        ctx,
        0.34,
        role="learner",
        facing="right",
        expression="curious",
        arm_up=ctx.hint == "strong",
        arm_out=ctx.hint == "medium",
    )
    draw_character_pose(ctx, 0.72, role="stranger", facing="left", expression="curious")
    if ctx.hint == "strong":
        draw_attention_marks(ctx, kind="focus", x=ctx.lx(0.48), y=ctx.ly(0.42))


def panel_clarify_understanding(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint))
    draw_character_pose(
        ctx,
        0.36,
        role="learner",
        facing="right",
        expression="warm" if ctx.hint != "light" else "neutral",
        holding_cup=True,
    )
    draw_character_pose(
        ctx,
        0.7,
        role="stranger",
        facing="left",
        expression="happy" if ctx.hint == "strong" else "warm",
        holding_cup=True,
    )


def panel_clarify_nod(ctx: PanelContext) -> None:
    """Light-tier beat: subtle mutual understanding."""
    draw_cafe_panel(ctx, clutter=0.7, busy=True)
    draw_character_pose(ctx, 0.4, role="learner", facing="right", expression="neutral", holding_cup=True)
    draw_character_pose(ctx, 0.72, role="stranger", facing="left", expression="warm", holding_cup=True)


def panel_closing_relaxed(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint), busy=ctx.hint == "light")
    draw_character_pose(ctx, 0.36, role="learner", facing="right", expression="warm", holding_cup=True)
    draw_character_pose(ctx, 0.7, role="stranger", facing="left", expression="warm", holding_cup=True)


def panel_closing_table(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=0.45, show_table=True)
    draw_cup_scaled(ctx.draw, ctx.lx(0.46), ctx.ly(0.58), rng=ctx.rng, scale=ctx.scale)
    draw_cup_scaled(ctx.draw, ctx.lx(0.56), ctx.ly(0.58), rng=ctx.rng, scale=ctx.scale)
    draw_character_pose(ctx, 0.3, role="learner", facing="right", expression="happy", arm_out=ctx.hint != "light")
    draw_character_pose(ctx, 0.74, role="stranger", facing="left", expression="warm", holding_cup=True)


def panel_closing_departure(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=_hint_clutter(ctx.hint), show_door=ctx.hint == "light")
    draw_character_pose(
        ctx,
        0.32,
        role="learner",
        facing="right",
        expression="warm",
        arm_up=ctx.hint == "strong",
        holding_cup=True,
    )
    draw_character_pose(
        ctx,
        0.7,
        role="stranger",
        facing="left",
        expression="warm",
        arm_up=ctx.hint != "light",
    )
    if ctx.hint == "strong":
        draw_attention_marks(ctx, kind="energy", x=ctx.lx(0.5), y=ctx.ly(0.32))


def panel_chat_busy(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=0.82, busy=True)
    draw_character_pose(ctx, 0.38, role="learner", facing="right", expression="warm", holding_cup=True)
    draw_character_pose(ctx, 0.72, role="stranger", facing="left", expression="happy", holding_cup=True)


def panel_natural_exchange(ctx: PanelContext) -> None:
    draw_cafe_panel(ctx, clutter=0.85, busy=True)
    draw_character_pose(ctx, 0.34, role="learner", facing="right", expression="neutral", arm_out=True)
    draw_character_pose(ctx, 0.74, role="stranger", facing="left", expression="warm", holding_cup=True)


# --- Full-page scene composers (dialogue from lib/coffee-shop-story-dialogue.json) ---

VISUAL_BEATS: dict[str, PanelPainter] = {
    "arrival_establishing": panel_arrival_establishing,
    "arrival_notice": panel_arrival_notice,
    "arrival_approach": panel_arrival_approach,
    "greeting_approach": panel_greeting_approach,
    "greeting_gesture": panel_greeting_gesture,
    "greeting_response": panel_greeting_response,
    "ordering_setup": panel_ordering_setup,
    "ordering_gesture": panel_ordering_gesture,
    "ordering_reaction": panel_ordering_reaction,
    "clarify_confused": panel_clarify_confused,
    "clarify_gesture": panel_clarify_gesture,
    "clarify_understanding": panel_clarify_understanding,
    "closing_relaxed": panel_closing_relaxed,
    "closing_table": panel_closing_table,
    "closing_departure": panel_closing_departure,
    "chat_busy": panel_chat_busy,
    "natural_exchange": panel_natural_exchange,
}


def draw_scene_from_spec(
    draw: ImageDraw.ImageDraw,
    rng: random.Random,
    spec: SceneSpec,
    *,
    background_only: bool = False,
) -> None:
    painters: list[PanelPainter] = []
    for index, beat_name in enumerate(spec.visual_beats):
        visual = VISUAL_BEATS.get(beat_name)
        if visual is None:
            raise KeyError(f"Unknown visual beat: {beat_name}")
        dialogue = None if background_only else (spec.panels[index] if index < len(spec.panels) else None)
        painters.append(make_dialogue_panel_painter(visual, dialogue))
    draw_comic_page(draw, rng, layout=spec.layout, hint=spec.hint, panels=painters)
    if spec.busy:
        draw_paper_texture(draw, (W - 120, 8, W - 8, 40), rng, density=8)


def build_scene_list(tier: str, *, background_only: bool = False) -> list[tuple[str, SceneFn]]:
    tier_data = load_scene_dialogue()[tier]
    return [
        (
            filename,
            lambda d, r, t=tier, f=filename, bg=background_only: draw_scene_from_spec(
                d, r, scene_spec_for(t, f), background_only=bg
            ),
        )
        for filename in tier_data
    ]


def scenes_for_tier(tier: str, *, background_only: bool = False) -> list[tuple[str, SceneFn]]:
    return build_scene_list(tier, background_only=background_only)


def out_dir(*parts: str) -> str:
    return os.path.join(
        os.path.dirname(__file__), "..", "public", "images", "lesson-scenes", "coffee-shop", *parts
    )


def save(rel_path: str, image: Image.Image) -> None:
    p = out_dir(rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    image.save(p, "PNG", optimize=True)
    print("wrote", p)


def new_scene(seed_key: str) -> tuple[Image.Image, ImageDraw.ImageDraw, random.Random]:
    rng = random.Random(_seed(seed_key))
    im = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(im)
    return im, draw, rng


def generate_tier(tier: str, *, background_only: bool = False) -> list[Image.Image]:
    images: list[Image.Image] = []
    for filename, painter in scenes_for_tier(tier, background_only=background_only):
        seed_key = f"{tier}/{filename}"
        im, draw, rng = new_scene(seed_key)
        painter(draw, rng)
        save(f"{tier}/{filename}", im)
        images.append(im.copy())
    return images


def build_contact_sheet(tier_images: dict[str, list[Image.Image]]) -> None:
    thumb_w, thumb_h = 320, 180
    cols, rows = 5, 3
    pad = 12
    label_h = 28
    sheet_w = cols * thumb_w + (cols + 1) * pad
    sheet_h = rows * (thumb_h + label_h) + (rows + 1) * pad
    sheet = Image.new("RGB", (sheet_w, sheet_h), PAPER)
    draw = ImageDraw.Draw(sheet)
    tiers = ("easy", "medium", "real")
    for row, tier in enumerate(tiers):
        for col, im in enumerate(tier_images[tier]):
            thumb = im.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            x = pad + col * (thumb_w + pad)
            y = pad + row * (thumb_h + label_h + pad)
            sheet.paste(thumb, (x, y))
            draw.rectangle([x, y, x + thumb_w, y + thumb_h], outline=INK_LIGHT, width=2)
            draw.text((x + 6, y + thumb_h + 4), f"{tier} #{col + 1}", fill=INK)
    save_path = out_dir("contact-sheet.png")
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    sheet.save(save_path, "PNG", optimize=True)
    print("wrote", save_path)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Generate coffee-shop lesson scene PNGs.")
    parser.add_argument(
        "--background-only",
        action="store_true",
        help="Omit baked-in speech bubbles; React comic UI supplies dialogue text.",
    )
    args = parser.parse_args()
    background_only = bool(args.background_only)

    all_tiers: dict[str, list[Image.Image]] = {}
    for tier in ("easy", "medium", "real"):
        all_tiers[tier] = generate_tier(tier, background_only=background_only)
    build_contact_sheet(all_tiers)
    mode = "background-only" if background_only else "with dialogue bubbles"
    print("Done: 15 coffee-shop multi-panel comic pages (%dx%d, %s)" % (W, H, mode))


if __name__ == "__main__":
    main()
