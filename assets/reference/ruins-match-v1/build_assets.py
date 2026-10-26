from PIL import Image,ImageEnhance,ImageDraw,ImageFont
from pathlib import Path
import json,shutil,hashlib,zipfile
P=Path('/workspace/scratch/83af4521170b'); O=P/'ruins_match_v1'; A=O/'assets'
src=P/'generated_images/exec-9014a704-d728-46da-ba4f-d5825ed3e2ee.png'
im=Image.open(src).convert('RGBA'); board=Image.open(P/'brick_match_v2/approved_board.png').convert('RGBA')
shutil.copy(src,O/'reference/source_atlas.png');board.crop((0,350,512,712)).save(O/'reference/approved_reference.png')
records=[]
def save(img,path,**meta):
 img.save(O/path); records.append(dict(file=path,size=list(img.size),**meta));return img
walls={}
# Shared intact grey pilaster, split at center: right half starts a module; left half ends it.
col=im.crop((273,0,301,550)).resize((12,96),Image.Resampling.LANCZOS)
for name,box,w in [('wall_relief',(0,0,420,550),128),('wall_carving',(420,0,840,550),96),('wall_broken',(840,0,1254,550),96),('wall_narrow',(1150,0,1254,550),32)]:
 wall=im.crop(box).resize((w,96),Image.Resampling.LANCZOS)
 wall.paste(col.crop((6,0,12,96)),(0,0));wall.paste(col.crop((0,0,6,96)),(w-6,0))
 walls[name]=save(wall,'assets/'+name+'.png',kind='wall',tiles=w//32)
floor=ImageEnhance.Brightness(im.crop((0,552,625,1254)).resize((128,128),Image.Resampling.LANCZOS)).enhance(.85)
# Equal opposite seams, only outermost pixel: no checkerboard variants.
for y in range(128):
 a=floor.getpixel((0,y));b=floor.getpixel((127,y)); c=tuple((a[i]+b[i])//2 for i in range(4));floor.putpixel((0,y),c);floor.putpixel((127,y),c)
for x in range(128):
 a=floor.getpixel((x,0));b=floor.getpixel((x,127));c=tuple((a[i]+b[i])//2 for i in range(4));floor.putpixel((x,0),c);floor.putpixel((x,127),c)
save(floor,'assets/floor_4x4.png',kind='floor')
edges={
'left':board.crop((32,422,50,550)).resize((16,128),Image.Resampling.LANCZOS),
'right':board.crop((440,422,458,486)).resize((16,64),Image.Resampling.LANCZOS),
'bottom':board.crop((62,633,190,657))}
for side,e in edges.items():save(e,'assets/edge_'+side+'.png',kind='edge')
# Actual corner fragments from separate left and right regions: no mirror.
seedL=board.crop((30,633,54,657));seedR=board.crop((434,633,458,657))
for side,count in [('left',4),('right',2)]:
 e=edges[side]
 for v in range(count):
  upper=e.crop((0,v*32,16,v*32+24)); save(upper,f'edge_fit/upper_{side}_v{v}.png',kind='upper',v_phase=v,tile_offset=[16 if side=='left' else 0,0])
  for wn,w in walls.items():
   end=e.crop((0,v*32+8,16,v*32+32))
   wx=w.width-16 if side=='left' else 0
   for row in range(4):end.paste(w.crop((wx,3-row,wx+16,4-row)),(0,20+row))
   save(end,f'ends_fit/end_vertical_{side}_v{v}__{wn}.png',kind='end_vertical',v_phase=v,wall=wn,tile_offset=[16 if side=='left' else 0,8])
 for h in range(4):
  b=edges['bottom'].crop((h*32,0,h*32+32,24))
  for v in range(count):
   vert=e.crop((0,v*32,16,v*32+32))
   corner=(seedL if side=='left' else seedR).copy()
   # lock horizontal and vertical connector edges to exact strip pixels.
   if side=='left':
    corner.paste(b.crop((28,0,32,24)),(20,0));corner.paste(vert.crop((0,0,16,4)),(8,0))
   else:
    corner.paste(b.crop((0,0,4,24)),(0,0));corner.paste(vert.crop((0,0,16,4)),(0,0))
   save(corner,f'edge_fit/corner_bottom_{side}_h{h}_v{v}.png',kind='corner_bottom',h_phase=h,v_phase=v,tile_offset=[8 if side=='left' else 0,0])
  x=0 if side=='left' else 8
  end=b.crop((x,0,x+24,24));out=0 if side=='left' else 23;inside=1 if side=='left' else 22
  end.paste(end.crop((inside,0,inside+1,24)),(out,0))
  save(end,f'ends_fit/end_bottom_{side}_h{h}.png',kind='end_bottom',h_phase=h,tile_offset=[x,0])
# Outer corners n+w use right edge (floor west); n+e use left edge (floor east).
for orient,side,count,x in [('nw','right',2,0),('ne','left',4,16)]:
 for h in range(4):
  b=edges['bottom'].crop((h*32,0,h*32+32,24))
  for v in range(count):
   vert=edges[side].crop((0,v*32,16,v*32+32)); c=Image.new('RGBA',(32,32));c.paste(b,(0,0));c.paste(vert,(x,0))
   # Join locally: horizontal arm outer edge remains source bottom strip.
   if x==0:c.paste(b.crop((16,0,32,24)),(16,0))
   else:c.paste(b.crop((0,0,16,24)),(0,0))
   save(c,f'edge_fit/outer_floor_{orient}_h{h}_v{v}.png',kind='outer',h_phase=h,v_phase=v,floor_sides=list(orient),tile_offset=[0,0])
for side in ['left','right']:
 for name in [f'corner_bottom_{side}_h0_v0',f'upper_{side}_v0']:
  dest=f'corner_bottom_{side}' if name.startswith('corner') else f'upper_{side}'
  save(Image.open(O/'edge_fit'/f'{name}.png'),f'assets/{dest}.png',kind='default',variant=name)
# Asset-only assembled room, no game or engine screenshot.
scene=Image.new('RGBA',(512,448),(9,9,12,255))
for y in range(160,384,32):
 for x in range(48,464,32):
  sx=(x//32%4)*32;sy=(y//32%4)*32;scene.paste(floor.crop((sx,sy,sx+32,sy+32)),(x,y))
x=48
for wn in ['wall_relief','wall_carving','wall_broken','wall_carving']:
 scene.paste(walls[wn],(x,64));x+=walls[wn].width
for y in range(64,384,32):
 scene.paste(edges['left'].crop((0,y%128,16,y%128+32)),(32,y));scene.paste(edges['right'].crop((0,y%64,16,y%64+32)),(464,y))
for x in range(48,464,32):scene.paste(edges['bottom'].crop((x%128,0,x%128+32,24)),(x,384))
scene.paste(Image.open(A/'corner_bottom_left.png'),(24,384));scene.paste(Image.open(A/'corner_bottom_right.png'),(464,384))
scene.convert('RGB').resize((1024,896),Image.Resampling.NEAREST).save(O/'assembly_preview_2x.png')
# Contact sheet for walls, all phases, and vertical ends against actual wall tops.
proof=Image.new('RGB',(768,1050),(18,19,23));d=ImageDraw.Draw(proof)
d.text((12,8),'RUINS 7-14F | ASSET ASSEMBLY - NOT GAME CAPTURE',fill='white')
y=40
for wn,w in walls.items():
 d.text((12,y),wn,fill='white');proof.paste(w.resize((w.width*2,192),Image.Resampling.NEAREST),(12,y+20))
 for j,side in enumerate(['left','right']):
  end=Image.open(O/'ends_fit'/f'end_vertical_{side}_v0__{wn}.png'); xx=330+j*170
  proof.paste(end.resize((32,48),Image.Resampling.NEAREST),(xx,y+20)); wx=w.width-16 if side=='left' else 0
  proof.paste(w.crop((wx,0,wx+16,80)).resize((32,160),Image.Resampling.NEAREST),(xx,y+68))
 y+=240
proof.save(O/'connections_2x.png')
manifest={'version':'ruins_match_v1','region':'地下の遺跡','floors':[7,14],'tile_px':32,'render_scale':1,'wall_height':96,'wall_order':['wall_relief','wall_carving','wall_broken'],'wall_remainder':{'3':'wall_carving','2':['wall_narrow','wall_narrow'],'1':'wall_narrow'},'phase':{'bottom':'x%4','left':'y%4','right':'y%2'},'assets':records,'wall_end_lookup':[{'wall':w,'left':f'ends_fit/end_vertical_left_v{{v}}__{w}.png','right':f'ends_fit/end_vertical_right_v{{v}}__{w}.png'} for w in walls]}
for r in records:r['sha256']=hashlib.sha256((O/r['file']).read_bytes()).hexdigest()
(O/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# meaningful exact checks
for w in walls.values():assert w.crop((0,0,6,96)).tobytes()==col.crop((6,0,12,96)).tobytes();assert w.crop((w.width-6,0,w.width,96)).tobytes()==col.crop((0,0,6,96)).tobytes()
for r in records:
 p=Image.open(O/r['file']);p.load();assert list(p.size)==r['size']
 if r['kind']=='end_vertical':
  w=walls[r['wall']];wx=w.width-16 if 'left_' in r['file'] else 0
  assert p.crop((0,23,16,24)).tobytes()==w.crop((wx,0,wx+16,1)).tobytes()
(O/'validation.json').write_text(json.dumps({'png_count':len(records),'dimensions':'pass','common_half_columns':'pass','vertical_wall_pixel_connection':'pass','game_engine_test':'not_run'},indent=2))
print('built',len(records))
