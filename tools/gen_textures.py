import sys, json, base64, urllib.request, time
url = sys.argv[1]
NEG = "perspective, 3d render, drop shadow, people, characters, text, watermark, logo, blurry, vignette, photo"
HDR = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
BASE = "seamless tileable {} texture, top-down flat orthographic view, hand-painted stylized game asset, even flat lighting, no shadows, no perspective"
JOBS = {
  # ground / streets
  "ground_grass":    "lush green grass meadow",
  "ground_dirt":     "dry packed dirt path with small pebbles",
  "ground_cobble":   "medieval cobblestone street, muted earthy stone",
  "ground_marble":   "polished white marble plaza floor with subtle veins",
  "ground_sand":     "fine desert sand with gentle ripples",
  "ground_neon":     "dark futuristic floor panels with glowing cyan grid lines",
  # walls by era
  "wall_mud":        "primitive mud and straw hut wall, rough adobe",
  "wall_wood":       "old vertical wooden plank cabin wall, weathered timber",
  "wall_stone":      "medieval grey stone block castle wall, mortar",
  "wall_plaster":    "rustic cream plaster house wall with cracks",
  "wall_brick":      "red industrial brick wall, victorian",
  "wall_concrete":   "plain grey concrete building wall, mid century",
  "wall_glass":      "modern blue glass and steel skyscraper facade, windows",
  "wall_neon":       "dark futuristic metal panel wall with glowing neon trim",
  # roofs
  "roof_thatch":     "golden thatched straw roof",
  "roof_clay":       "terracotta clay roof tiles, orange red",
  "roof_shingle":    "grey wooden shingle roof",
  "roof_slate":      "dark slate tile roof",
  "roof_metal":      "corrugated metal sheet roof, industrial",
}
t0 = time.time()
for i,(name,desc) in enumerate(JOBS.items(),1):
  payload = {"prompt": BASE.format(desc), "negative_prompt": NEG, "steps": 24, "width": 768, "height": 768,
             "sampler_name": "DPM++ 2M", "cfg_scale": 6.0, "tiling": True, "seed": 1000+i}
  req = urllib.request.Request(url+"/sdapi/v1/txt2img", data=json.dumps(payload).encode(), headers=HDR)
  r = json.load(urllib.request.urlopen(req, timeout=240))
  open(f"public/assets/textures/{name}.png","wb").write(base64.b64decode(r["images"][0]))
  print(f"[{i:2}/{len(JOBS)}] {name}.png  ({time.time()-t0:.0f}s)")
print(f"LISTO · {len(JOBS)} texturas en {time.time()-t0:.0f}s")
