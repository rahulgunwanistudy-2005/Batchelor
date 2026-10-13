#!/usr/bin/env python3
"""Rasterize the project's licensed self-hosted fonts for dependency-free OG PNGs.
Offline regeneration requires Pillow; normal web builds use the committed atlas.
"""
import base64
import hashlib
import json
from pathlib import Path
import zlib
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
fonts={
 'price':('bricolage-grotesque','bricolage-grotesque-latin-700-normal.woff',120),
 'heading':('bricolage-grotesque','bricolage-grotesque-latin-700-normal.woff',52),
 'text':('ibm-plex-sans','ibm-plex-sans-latin-400-normal.woff',28),
}
atlas={}
for key,(package,name,size) in fonts.items():
 path=ROOT/'apps/web/node_modules/@fontsource'/package/'files'/name
 font=ImageFont.truetype(str(path),size)
 glyphs={}
 for code in range(32,127):
  char=chr(code);width=max(1,round(font.getlength(char)));height=round(size*1.4)
  mask=Image.new('L',(width,height));ImageDraw.Draw(mask).text((0,0),char,font=font,fill=255)
  glyphs[char]={'width':width,'height':height,'pixels':base64.b64encode(zlib.compress(mask.tobytes(),9)).decode()}
 atlas[key]={'size':size,'source':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'glyphs':glyphs}
(ROOT/'apps/web/src/lib/server/og-fonts.generated.json').write_text(json.dumps(atlas,separators=(',',':'))+'\n')
print('Generated glyph atlas from existing Bricolage Grotesque and IBM Plex Sans fonts.')
