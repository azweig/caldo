import json, base64, urllib.request, io, os, time
from PIL import Image
from rembg import remove, new_session

URL="http://127.0.0.1:7860"; OUT="/workspace/people"; os.makedirs(OUT,exist_ok=True)
SESSION=new_session("u2net")
NEG="character sheet, multiple poses, multiple views, two people, duplicate, cropped, close up, nsfw, nude, text, watermark, realistic photo, dark background, cluttered background, furniture"
ERAS={
 "prehist":"primitive animal fur and hide clothing with bone ornaments",
 "ancient":"a simple linen tunic and sandals, bronze age",
 "medieval":"a medieval wool tunic and hooded cloak",
 "renais":"a renaissance doublet and feathered hat with ornate fabric",
 "industrial":"a victorian 19th century vest, coat and flat cap",
 "modern":"modern 20th century casual shirt and trousers",
 "future":"a sleek futuristic sci-fi bodysuit with glowing neon accents",
}
ROLES={
 "commoner":"a humble common worker in plain clothes",
 "merchant":"a wealthy merchant in fine rich clothes with jewelry",
 "scholar":"a learned scholar holding a book",
 "warrior":"an armored warrior holding a weapon",
}
SEX={"m":"man","f":"woman"}
def gen(prompt,seed):
    p={"prompt":prompt,"negative_prompt":NEG,"steps":22,"width":768,"height":1024,"sampler_name":"DPM++ 2M","cfg_scale":7,"seed":seed}
    req=urllib.request.Request(URL+"/sdapi/v1/txt2img",data=json.dumps(p).encode(),headers={"Content-Type":"application/json"})
    r=json.load(urllib.request.urlopen(req,timeout=300))
    return Image.open(io.BytesIO(base64.b64decode(r["images"][0]))).convert("RGBA")
def cut(im):
    o=remove(im,session=SESSION); bb=o.getbbox(); return o.crop(bb) if bb else o
seed=1000; i=0; t0=time.time(); total=len(ERAS)*len(ROLES)*len(SEX)*2
for et,ec in ERAS.items():
 for rk,rc in ROLES.items():
  for sk,sc in SEX.items():
   for v in range(2):
    i+=1; name=f"{et}_{rk}_{sk}_{v}"
    prompt=f"full body {sc} character, {rc} wearing {ec}, standing straight facing the camera, full body visible head to feet, plain solid white background, stylized cute RPG game character art, cel shaded, clean"
    try:
        cut(gen(prompt,seed)).save(f"{OUT}/{name}.png"); print(f"[{i}/{total}] {name} ({time.time()-t0:.0f}s)",flush=True)
    except Exception as e: print(f"[{i}/{total}] {name} ERROR {e}",flush=True)
    seed+=1
print("PEOPLE_DONE",flush=True)
