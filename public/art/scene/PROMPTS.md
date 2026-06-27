# Prompts — ESCENA 2.5D Ghibli (SPRING / primavera)

Set completo para lograr **profundidad por capas + color + calidez** estilo Ghibli, manteniendo por ahora
las personas y casas procedurales feas. La idea: el FONDO + la VEGETACIÓN + los SUELOS hacen el 90% del look.

Generá cada uno con su prompt COMPLETO (copiá el bloque `> ...` tal cual). Dejalos con el NOMBRE DE ARCHIVO
exacto en la carpeta indicada.

**Estilo común (ya incluido en cada prompt):** *Studio-Ghibli-meets-Stardew-Valley, soft hand-painted, warm
cohesive palette, gentle cel-shading, soft outlines, dreamy daylight.*

**3 tipos de asset (OJO con esto):**
- 🟦 **Panorámicos** (cielo, fondo de colinas) → SIN transparencia, wrap horizontal (borde izq = der).
- 🟩 **Suelos tileables** → SIN transparencia, tilean en las 4 direcciones (sin costura).
- 🟨 **Props/sprites** (árboles, rocas, etc.) → **fondo TRANSPARENTE (PNG alpha)**, 1 solo objeto, vista 3/4,
  base/raíz centrada abajo (punto de apoyo).

---

# A · CAPAS DE FONDO (lo que da la PROFUNDIDAD) → `public/art/scene/`

## sky.png  🟦
> Hand-painted Studio-Ghibli sky panorama, soft blue gradient with gentle fluffy cream-colored clouds, warm dreamy daylight, peaceful, no ground, no horizon line, no characters, no objects, no text, seamless horizontal wrap (left edge matches right edge), 2048x512.

**Para qué:** la cúpula del cielo. Capa más lejana.

## backdrop_hills.png  🟦  ← EL MÁS IMPORTANTE PARA LA PROFUNDIDAD
> Hand-painted Studio-Ghibli distant landscape backdrop, soft rolling green hills and faraway misty blue mountains, layered depth with atmospheric haze (far layers paler and bluer), a few tiny distant trees on the ridges, spring countryside, no foreground, no characters, no big buildings, no text, seamless horizontal panorama (left edge matches right edge), 4096x1024.

**Para qué:** el anillo de colinas detrás del pueblo. Reemplaza la pared de troncos fea. Crea las capas (pueblo → colinas → cielo).

## midground_trees.png  🟦
> Hand-painted Studio-Ghibli treeline band, a soft row of distant spring trees and bushes with light morning haze, pale and slightly blue from distance, transparent background above and below (PNG alpha) so it sits as a middle layer, no characters, no buildings, no text, seamless horizontal, 4096x512.

**Para qué:** una franja de árboles a media distancia, ENTRE las colinas y el pueblo. Suma una capa más de profundidad (opcional pero potente).

---

# B · SUELOS (tileables) → `public/art/scene/`

## ground_grass.png  🟩  ✅ YA GENERADO (spring)
*(ya está)*

## ground_dirt.png  🟩
> Seamless tileable hand-painted Studio-Ghibli ground texture, packed earth dirt path, warm brown soil with small scattered pebbles and faint footpath wear, top-down, even flat lighting, no shadows, no objects, no characters, no text, edges tile perfectly, 1024x1024.

**Para qué:** los caminos de tierra por donde camina la gente.

## ground_cobble.png  🟩
> Seamless tileable hand-painted Studio-Ghibli ground texture, old cobblestone paving of rounded grey-brown stones with little tufts of grass in the cracks, top-down, even flat lighting, no shadows, no objects, no characters, no text, edges tile perfectly, 1024x1024.

**Para qué:** las calles empedradas de eras más avanzadas.

## field_crop.png  🟩
> Seamless tileable hand-painted Studio-Ghibli farm field texture, tilled brown soil with neat parallel rows of small green spring crop sprouts, top-down, even flat lighting, no shadows, no characters, no text, edges tile perfectly, 1024x1024.

**Para qué:** los jardines/campos de cultivo (parches). Da el toque de pueblo agrícola.

---

# C · VEGETACIÓN (sprites — reemplazan los conos verdes feos) → `public/art/props/`
Todos 🟨 **fondo transparente**, 1 árbol/planta, vista 3/4, tronco/base centrado abajo. ~1024x1024.

## tree_pine.png
> Soft hand-painted Studio-Ghibli tall pine/conifer tree, lush layered green needles, warm sunlight, gentle painterly style, 3/4 view, full tree with trunk base centered at bottom, transparent background (PNG alpha), single tree, no scene, no ground, no text.

**Para qué:** el pino alto (como el grande de la referencia). Árbol principal.

## tree_blossom.png
> Soft hand-painted Studio-Ghibli cherry blossom tree in full pink bloom, delicate petals, warm spring light, dreamy, 3/4 view, trunk base centered at bottom, transparent background (PNG alpha), single tree, no scene, no ground, no text.

**Para qué:** el cerezo en flor — súper Ghibli, da el color rosa de primavera.

## tree_broadleaf.png
> Soft hand-painted Studio-Ghibli round broadleaf tree, full green canopy, soft warm light, 3/4 view, trunk base centered at bottom, transparent background (PNG alpha), single tree, no scene, no ground, no text.

**Para qué:** árbol frondoso redondo, para variar el bosque.

## bush.png
> Soft hand-painted Studio-Ghibli small leafy bush/shrub with a few tiny flowers, warm light, 3/4 view, base centered at bottom, transparent background (PNG alpha), single bush, no scene, no text.

**Para qué:** arbustos sueltos entre las casas, llenan el suelo.

## flowers.png
> Soft hand-painted Studio-Ghibli cluster of wildflowers (white daisies, yellow buttercups, blue forget-me-nots) with green leaves, warm light, 3/4 view, base centered at bottom, transparent background (PNG alpha), small clump, no scene, no text.

**Para qué:** matas de flores para el primer plano y los bordes — detalle y calidez.

## grass_tuft.png
> Soft hand-painted Studio-Ghibli tuft of tall lush spring grass and reeds, warm light, 3/4 view, base centered at bottom, transparent background (PNG alpha), single clump, no scene, no text.

**Para qué:** matas de pasto alto, rompen la planicie del suelo y dan textura/volumen.

---

# D · ROCAS Y DETALLES → `public/art/props/`
🟨 transparente, 3/4, base abajo. ~512x512.

## rock_big.png
> Soft hand-painted Studio-Ghibli large mossy grey boulder, warm light, 3/4 view, base centered at bottom, transparent background (PNG alpha), single rock, no scene, no text.

**Para qué:** rocas grandes que acentúan el primer plano (como en la referencia).

## rock_small.png
> Soft hand-painted Studio-Ghibli small cluster of grey pebbles and stones, warm light, 3/4 view, transparent background (PNG alpha), no scene, no text.

**Para qué:** piedritas sueltas en los caminos.

## log.png
> Soft hand-painted Studio-Ghibli fallen mossy wooden log, warm light, 3/4 view, transparent background (PNG alpha), single log, no scene, no text.

**Para qué:** tronco caído, detalle natural del bosque.

## lantern.png
> Soft hand-painted Studio-Ghibli hanging paper lantern, soft warm glow, 3/4 view, transparent background (PNG alpha), single lantern, no scene, no text.

**Para qué:** farolito colgante (como los de la casa japonesa) — calidez y detalle de pueblo.

---

# RESUMEN — qué generar para el test de profundidad (spring)
**Fondo (3):** sky · backdrop_hills · midground_trees
**Suelos (3):** ground_dirt · ground_cobble · field_crop   *(grass ya está)*
**Vegetación (6):** tree_pine · tree_blossom · tree_broadleaf · bush · flowers · grass_tuft
**Detalles (4):** rock_big · rock_small · log · lantern

Total: **~16 sprites**. Con esto armo la escena 2.5D con profundidad real (capas + neblina + vegetación pintada),
manteniendo casas y personas procedurales. Si funciona, escalamos a las otras estaciones/eras y después a casas y personas.

---

# (Después — NO generar todavía)
- **Casas ilustradas:** `public/art/buildings/` — por era × familia cultural.
- **Personas ilustradas:** `public/art/people/` — por era × familia × rol × sexo × edad.
- Plan completo: `/ART_PLAN.md`.
