"""Marketplace tile: the open dial wrapped around the mascot.

Scaled to leave a thin margin rather than the generous one it had - the tile is
shown at 32px in a marketplace grid, where padding is the first thing to cost
legibility. Not zero: the rounded corner needs room to read as a tile.
"""
from PIL import Image, ImageDraw

SS = 4                      # supersample
S = 256 * SS
GROUND = (22, 17, 15, 255)  # #16110F
ACCENT = (217, 119, 87)
TRACK = tuple(round(0.2 * a + 0.8 * g) for a, g in zip(ACCENT, GROUND[:3])) + (255,)

MARGIN = 13                 # was 31 - the dial now fills the tile
RING_R, RING_W = 98, 36     # outer radius 116, so diameter 232 of 256
MASCOT = 115                # was 96

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=56 * SS, fill=GROUND)

cx = cy = 128 * SS
r, w = RING_R * SS, RING_W * SS
box = [cx - r, cy - r, cx + r, cy + r]
d.arc(box, start=0, end=360, fill=TRACK, width=w)
d.arc(box, start=-90, end=-90 + 360 * 319 / 515.2, fill=ACCENT + (255,), width=w)

notch = 5 * SS
d.rectangle([cx - notch, (MARGIN - 3) * SS, cx + notch, (MARGIN + 34) * SS], fill=GROUND)

# The mascot, centred, scaled with the ring.
scale = MASCOT / 96
OX = OY = (256 - MASCOT) / 2
def rect(x, y, rw, rh, fill):
    d.rectangle([round((OX + x * scale) * SS), round((OY + y * scale) * SS),
                 round((OX + (x + rw) * scale) * SS) - 1, round((OY + (y + rh) * scale) * SS) - 1], fill=fill)

for x, y, rw, rh in [
    (24, 16, 48, 8), (16, 24, 64, 32), (8, 32, 8, 16), (80, 32, 8, 16),
    (24, 56, 48, 8), (28, 64, 8, 16), (44, 64, 8, 16), (60, 64, 8, 16),
]:
    rect(x, y, rw, rh, ACCENT + (255,))
rect(36, 32, 8, 16, GROUND)
rect(60, 32, 8, 16, GROUND)

img = img.resize((256, 256), Image.LANCZOS)
img.save('media/icon.png')
img.resize((128, 128), Image.LANCZOS).save('media/icon-128.png')
print(f'icon rebuilt - dial spans {2 * (RING_R + RING_W // 2)}/256, margin {MARGIN}px')
