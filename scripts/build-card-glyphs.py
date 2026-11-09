import json
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

CARD_WEIGHT = 800


def glyphs_of(path):
    font = instantiateVariableFont(TTFont(path), {"wght": CARD_WEIGHT})
    glyph_set = font.getGlyphSet()
    found = {}
    for codepoint, name in font.getBestCmap().items():
        pen = SVGPathPen(glyph_set, lambda value: f"{round(value)}")
        glyph_set[name].draw(pen)
        found[str(codepoint)] = [glyph_set[name].width, pen.getCommands()]
    return font, found


def main(latin, latin_ext, out):
    font, glyphs = glyphs_of(latin)
    _, extended = glyphs_of(latin_ext)
    merged = {**extended, **glyphs}
    with open(out, "w") as file:
        json.dump({
            "unitsPerEm": font["head"].unitsPerEm,
            "ascender": font["hhea"].ascent,
            "descender": font["hhea"].descent,
            "glyphs": merged,
        }, file, separators=(",", ":"))


if __name__ == "__main__":
    main(*sys.argv[1:4])
