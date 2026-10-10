"""Render the PNG app icons (same design as icons/icon.svg). Needs Pillow.

    python tools/make_icons.py
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG, ROW, HI_FILL, RED = '#111215', '#3a3e46', '#3b1519', '#e8414e'


def draw(size, maskable=False, scale=4):
    s = size * scale
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle((0, 0, s, s), fill=BG)
        k, off = s / 512 * 0.78, s * 0.11  # keep the art inside the maskable safe zone
    else:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=112 * s / 512, fill=BG)
        k, off = s / 512, 0

    def box(x, y, w, h):
        return (off + x * k, off + y * k, off + (x + w) * k, off + (y + h) * k)

    d.rounded_rectangle(box(88, 124, 232, 52), radius=12 * k, fill=ROW)
    d.rounded_rectangle(box(88, 230, 232, 52), radius=12 * k, fill=HI_FILL, outline=RED, width=round(12 * k))
    d.rounded_rectangle(box(88, 336, 232, 52), radius=12 * k, fill=ROW)
    # map pin: circle head + point
    d.ellipse(box(334, 146, 116, 116), fill=RED)
    d.polygon([(off + 342 * k, off + 236 * k), (off + 442 * k, off + 236 * k), (off + 392 * k, off + 302 * k)], fill=RED)
    d.ellipse(box(370, 182, 44, 44), fill=BG)
    return img.resize((size, size), Image.LANCZOS)


def main():
    out = os.path.join(ROOT, 'icons')
    draw(192).save(os.path.join(out, 'icon-192.png'))
    draw(512).save(os.path.join(out, 'icon-512.png'))
    draw(512, maskable=True).save(os.path.join(out, 'icon-maskable-512.png'))
    # iOS draws its own rounded corners and shows transparency as black.
    draw(180, maskable=True).convert('RGB').save(os.path.join(out, 'apple-touch-icon.png'))
    print('icons written to', out)


if __name__ == '__main__':
    main()
