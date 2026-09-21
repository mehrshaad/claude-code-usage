"""Build the extension's icon font: the mascot and the meter tick cells.

The VS Code status bar renders codicons only - no SVG, no images - so custom
artwork there has to arrive as `contributes.icons` with a font file.

Metrics deliberately mirror VS Code's own codicon font, which uses ascent =
upem, descent = 0, and draws every glyph entirely above the baseline filling
~94% of the em. Anything hanging below the baseline sits visibly low next to
the icons around it.
"""
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPEM = 1000
# 80% of the em rather than 94%. At 94% the glyphs are as tall as the line box
# allows, which inflates the status bar item's height - visible as a background
# pill taller than its neighbours and sitting high against them.
BOX = 800
PAD = (UPEM - BOX) // 2

# Candidate i's mascot in its 96x96 design box (SVG coordinates, y down).
SOLID = [
    (24, 16, 48, 8), (16, 24, 64, 32), (8, 32, 8, 16), (80, 32, 8, 16),
    (24, 56, 48, 8), (28, 64, 8, 16), (44, 64, 8, 16), (60, 64, 8, 16),
]
HOLES = [(36, 32, 8, 16), (60, 32, 8, 16)]

SRC_X0, SRC_X1, SRC_Y0, SRC_Y1 = 8, 88, 16, 80
SCALE = min(BOX / (SRC_X1 - SRC_X0), BOX / (SRC_Y1 - SRC_Y0))
ART_H = (SRC_Y1 - SRC_Y0) * SCALE
Y_OFF = (UPEM - ART_H) / 2      # centred in the em, never below the baseline

fx = lambda x: round((x - SRC_X0) * SCALE + PAD)
fy = lambda y: round((SRC_Y1 - y) * SCALE + Y_OFF)


def rect(pen, x, y, w, h, clockwise=True):
    pts = [(fx(x), fy(y)), (fx(x + w), fy(y)), (fx(x + w), fy(y + h)), (fx(x), fy(y + h))]
    if not clockwise:
        pts.reverse()
    pen.moveTo(pts[0])
    for p in pts[1:]:
        pen.lineTo(p)
    pen.closePath()


def parallelogram(pen, x0, x1, y0, y1, slant, clockwise=True):
    pts = [(x0, y0), (x1, y0), (x1 + slant, y1), (x0 + slant, y1)]
    if not clockwise:
        pts.reverse()
    pen.moveTo(pts[0])
    for p in pts[1:]:
        pen.lineTo(p)
    pen.closePath()


pen = TTGlyphPen(None)
for r in SOLID:
    rect(pen, *r)
for r in HOLES:
    rect(pen, *r, clockwise=False)   # opposite winding punches the eyes
mascot = pen.glyph()

# Tick cells: full height of the same box, so the meter matches the icon beside it.
TX0, TX1, TY0, TY1, SLANT, INSET = 40, 450, PAD, PAD + BOX, 90, 100

# Circle cells. Drawn here rather than taken from Unicode: ○ (U+25CB), ◐
# (U+25D0) and ● (U+25CF) come from different ranges and Windows fonts draw them
# at visibly different sizes and advances, so the meter looked ragged. Owning the
# glyphs makes every cell identical on every platform.
# A circle's height is its width, so the radius is bound by the advance rather
# than by the box: at BOX/2 they overlapped their neighbours.
CIRCLE_ADVANCE = 620
CIRCLE_R = 260
CIRCLE_CX, CIRCLE_CY = CIRCLE_ADVANCE // 2, PAD + BOX // 2
CIRCLE_STROKE = 78
import math


def circle(pen, cx, cy, r, clockwise=True, n=8):
    """A circle as quadratic arcs - TrueType glyphs carry no cubics."""
    step = 2 * math.pi / n
    ctrl_r = r / math.cos(step / 2)
    on = [(cx + r * math.cos(i * step), cy + r * math.sin(i * step)) for i in range(n)]
    ctrl = [(cx + ctrl_r * math.cos((i + 0.5) * step), cy + ctrl_r * math.sin((i + 0.5) * step))
            for i in range(n)]
    if not clockwise:
        on = [on[0]] + on[1:][::-1]
        ctrl = ctrl[::-1]
    pen.moveTo((round(on[0][0]), round(on[0][1])))
    for i in range(n):
        end = on[(i + 1) % n]
        pen.qCurveTo((round(ctrl[i][0]), round(ctrl[i][1])), (round(end[0]), round(end[1])))
    pen.closePath()


def half_disc(pen, cx, cy, r, n=8):
    """The left half filled - a meter grows left to right."""
    step = math.pi / n
    ctrl_r = r / math.cos(step / 2)
    # From the top, round the left side, down to the bottom, then straight back.
    on = [(cx + r * math.cos(math.pi / 2 + i * step), cy + r * math.sin(math.pi / 2 + i * step))
          for i in range(n + 1)]
    ctrl = [(cx + ctrl_r * math.cos(math.pi / 2 + (i + 0.5) * step),
             cy + ctrl_r * math.sin(math.pi / 2 + (i + 0.5) * step)) for i in range(n)]
    pen.moveTo((round(on[0][0]), round(on[0][1])))
    for i in range(n):
        pen.qCurveTo((round(ctrl[i][0]), round(ctrl[i][1])),
                     (round(on[i + 1][0]), round(on[i + 1][1])))
    pen.lineTo((round(on[0][0]), round(on[0][1])))
    pen.closePath()


cp = TTGlyphPen(None)
circle(cp, CIRCLE_CX, CIRCLE_CY, CIRCLE_R)
circle_full = cp.glyph()

cp = TTGlyphPen(None)
circle(cp, CIRCLE_CX, CIRCLE_CY, CIRCLE_R)
circle(cp, CIRCLE_CX, CIRCLE_CY, CIRCLE_R - CIRCLE_STROKE, clockwise=False)
circle_empty = cp.glyph()

cp = TTGlyphPen(None)
circle(cp, CIRCLE_CX, CIRCLE_CY, CIRCLE_R)
circle(cp, CIRCLE_CX, CIRCLE_CY, CIRCLE_R - CIRCLE_STROKE, clockwise=False)
half_disc(cp, CIRCLE_CX, CIRCLE_CY, CIRCLE_R - CIRCLE_STROKE)
circle_half = cp.glyph()

tp = TTGlyphPen(None)
parallelogram(tp, TX0, TX1, TY0, TY1, SLANT)
tick_full = tp.glyph()

tp = TTGlyphPen(None)
parallelogram(tp, TX0, TX1, TY0, TY1, SLANT)
parallelogram(tp, TX0 + INSET, TX1 - INSET, TY0 + INSET, TY1 - INSET, SLANT, clockwise=False)
tick_empty = tp.glyph()

fb = FontBuilder(UPEM, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'mascot', 'tickFull', 'tickEmpty',
                    'circleFull', 'circleHalf', 'circleEmpty'])
fb.setupCharacterMap({
    0xE001: 'mascot', 0xE010: 'tickFull', 0xE011: 'tickEmpty',
    0xE020: 'circleFull', 0xE021: 'circleHalf', 0xE022: 'circleEmpty',
})
fb.setupGlyf({'.notdef': TTGlyphPen(None).glyph(), 'mascot': mascot,
              'tickFull': tick_full, 'tickEmpty': tick_empty,
              'circleFull': circle_full, 'circleHalf': circle_half,
              'circleEmpty': circle_empty})
fb.setupHorizontalMetrics({
    '.notdef': (UPEM, 0),
    'mascot': (UPEM, fx(SRC_X0)),
    'tickFull': (600, TX0), 'tickEmpty': (600, TX0),
    'circleFull': (CIRCLE_ADVANCE, CIRCLE_CX - CIRCLE_R),
    'circleHalf': (CIRCLE_ADVANCE, CIRCLE_CX - CIRCLE_R),
    'circleEmpty': (CIRCLE_ADVANCE, CIRCLE_CX - CIRCLE_R),
})
fb.setupHorizontalHeader(ascent=UPEM, descent=0)
fb.setupNameTable({'familyName': 'claude-code-meter', 'styleName': 'Regular',
                   'psName': 'claude-code-meter-Regular', 'version': '1.0'})
fb.setupOS2(sTypoAscender=UPEM, sTypoDescender=0, usWinAscent=UPEM, usWinDescent=0)
fb.setupPost()
fb.save('media/mascot.ttf')
print(f'mascot y {fy(SRC_Y1)}..{fy(SRC_Y0)}, ticks y {TY0}..{TY1}, '
      f'circles r{CIRCLE_R} at y{CIRCLE_CY} - all above the baseline in a {UPEM} em')
