"""Build a one-glyph icon font carrying the mascot.

The VS Code status bar renders codicons only - it takes no SVG and no image.
The single supported way to ship custom artwork there is `contributes.icons`
with a font file, so the mascot is emitted as a TrueType glyph.
"""
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Candidate i's mascot, in its 96x96 design box (SVG coordinates, y down).
SOLID = [
    (24, 16, 48, 8),    # crown
    (16, 24, 64, 32),   # face
    (8, 32, 8, 16),     # left ear
    (80, 32, 8, 16),    # right ear
    (24, 56, 48, 8),    # jaw
    (28, 64, 8, 16),    # legs
    (44, 64, 8, 16),
    (60, 64, 8, 16),
]
HOLES = [(36, 32, 8, 16), (60, 32, 8, 16)]   # eyes

# Content spans x 8..88, y 16..80. Fill the em box with minimal padding so the
# glyph reads as large as possible at 14px in the status bar.
SCALE, OFF_X, BASE = 11, -28, -60
fx = lambda x: round(x * SCALE + OFF_X)
fy = lambda y: round((80 - y) * SCALE + BASE)

def rect(pen, x, y, w, h, clockwise=True):
    pts = [(fx(x), fy(y)), (fx(x + w), fy(y)), (fx(x + w), fy(y + h)), (fx(x), fy(y + h))]
    if not clockwise:
        pts.reverse()
    pen.moveTo(pts[0])
    for p in pts[1:]:
        pen.lineTo(p)
    pen.closePath()

def parallelogram(pen, x0, x1, y0, y1, slant, clockwise=True):
    """A ▰-shaped cell, drawn large enough to read in the status bar."""
    pts = [(x0, y0), (x1, y0), (x1 + slant, y1), (x0 + slant, y1)]
    if not clockwise:
        pts.reverse()
    pen.moveTo(pts[0])
    for pt in pts[1:]:
        pen.lineTo(pt)
    pen.closePath()


pen = TTGlyphPen(None)
for r in SOLID:
    rect(pen, *r, clockwise=True)
for r in HOLES:
    # Opposite winding punches the eyes out under the non-zero fill rule.
    rect(pen, *r, clockwise=False)
mascot = pen.glyph()

# The tick cells. Text glyphs are sized by the editor font; these are drawn in
# the em box instead, so the meter reads larger without getting wider.
TICK_X0, TICK_X1, TICK_Y0, TICK_Y1, SLANT = 40, 470, -60, 700, 90
INSET = 95

tick_pen = TTGlyphPen(None)
parallelogram(tick_pen, TICK_X0, TICK_X1, TICK_Y0, TICK_Y1, SLANT)
tick_full = tick_pen.glyph()

tick_pen = TTGlyphPen(None)
parallelogram(tick_pen, TICK_X0, TICK_X1, TICK_Y0, TICK_Y1, SLANT)
parallelogram(tick_pen, TICK_X0 + INSET, TICK_X1 - INSET,
              TICK_Y0 + INSET, TICK_Y1 - INSET, SLANT, clockwise=False)
tick_empty = tick_pen.glyph()

blank = TTGlyphPen(None).glyph()
order = ['.notdef', 'mascot', 'tickFull', 'tickEmpty']
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap({0xE001: 'mascot', 0xE010: 'tickFull', 0xE011: 'tickEmpty'})
fb.setupGlyf({'.notdef': blank, 'mascot': mascot, 'tickFull': tick_full, 'tickEmpty': tick_empty})
fb.setupHorizontalMetrics({
    '.notdef': (1000, 0), 'mascot': (1000, fx(8)),
    'tickFull': (620, TICK_X0), 'tickEmpty': (620, TICK_X0)
})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({
    'familyName': 'claude-code-meter', 'styleName': 'Regular',
    'psName': 'claude-code-meter-Regular', 'version': '1.0'
})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.save('media/mascot.ttf')

xs = [fx(8), fx(88)]
ys = [fy(80), fy(16)]
print(f'glyphs: mascot, tickFull, tickEmpty')
print(f'media/mascot.ttf written - glyph box x {xs[0]}..{xs[1]}, y {ys[0]}..{ys[1]} of a 1000 em')
