import json, base64, urllib.request, io, os, time
from PIL import Image
from rembg import remove, new_session
URL="http://127.0.0.1:7860"; SES=new_session("u2net")
HDR={"Content-Type":"application/json"}
def gen(prompt,neg,w,h,seed):
    p={"prompt":prompt,"negative_prompt":neg,"steps":24,"width":w,"height":h,"sampler_name":"DPM++ 2M","cfg_scale":7.5,"seed":seed}
    r=json.load(urllib.request.urlopen(urllib.request.Request(URL+"/sdapi/v1/txt2img",data=json.dumps(p).encode(),headers=HDR),timeout=300))
    return Image.open(io.BytesIO(base64.b64decode(r["images"][0]))).convert("RGBA")
def cut(im,hpx):
    o=remove(im,session=SES); bb=o.getbbox(); o=o.crop(bb) if bb else o
    w=int(o.width*hpx/o.height); return o.resize((max(1,w),hpx), Image.LANCZOS)

PNEG="blurry, smooth shading, 3d render, realistic photo, multiple characters, two people, text, watermark, frame, border"
ERAS={"prehist":"primitive fur and hide clothing","ancient":"a linen tunic","medieval":"a medieval tunic and cloak","renais":"a renaissance doublet and hat","industrial":"a victorian vest and coat","modern":"modern casual clothes","future":"a sci-fi neon bodysuit"}
ROLES={"commoner":"peasant","merchant":"rich merchant","scholar":"scholar with a book","warrior":"armored warrior with a weapon"}
SEX={"m":"man","f":"woman"}
os.makedirs("/workspace/pix_people",exist_ok=True); os.makedirs("/workspace/pix_houses",exist_ok=True)
t0=time.time(); seed=2000; i=0; total=len(ERAS)*len(ROLES)*len(SEX)+len(ERAS)
for e,ec in ERAS.items():
 for r,rc in ROLES.items():
  for s,sc in SEX.items():
    i+=1
    pr=f"16-bit pixel art character sprite of a {rc} {sc} wearing {ec}, full body, standing front view, retro SNES JRPG style, crisp clean pixels, limited color palette, plain white background"
    cut(gen(pr,PNEG,768,1024,seed),128).save(f"/workspace/pix_people/{e}_{r}_{s}_0.png"); seed+=1
    print(f"[{i}/{total}] people {e}_{r}_{s} ({time.time()-t0:.0f}s)",flush=True)
HNEG="blurry, smooth, 3d render, realistic photo, people, characters, text, watermark, frame"
HOUSES={"prehist":"a primitive thatched hut","ancient":"a simple stone and clay house","medieval":"a medieval timber and stone cottage with thatched roof","renais":"a renaissance townhouse","industrial":"a victorian brick house","modern":"a modern suburban house","future":"a futuristic neon sci-fi house"}
for e,hc in HOUSES.items():
    i+=1
    pr=f"16-bit pixel art building sprite, {hc}, 3/4 top-down RPG map view, crisp clean pixels, limited palette, plain white background, single building centered"
    cut(gen(pr,HNEG,896,896,seed),140).save(f"/workspace/pix_houses/{e}.png"); seed+=1
    print(f"[{i}/{total}] house {e} ({time.time()-t0:.0f}s)",flush=True)
print("PIX_DONE",flush=True)
