# Prompts — LOTE SCENERY (suelos + cielo)

Cada prompt está COMPLETO (copiá y pegá tal cual en Gemini). Dejá el PNG resultante en esta misma
carpeta (`public/art/scene/`) con el NOMBRE DE ARCHIVO exacto.

⚠️ Los suelos DEBEN ser **seamless / tileables** (el borde izquierdo calza con el derecho, y arriba con
abajo) o se va a ver la grilla repetida. El cielo NO es tileable, es panorámico.

Tamaño sugerido: suelos 1024×1024, cielo 2048×512. Sin texto, sin marca de agua.

---

## 1) ground_grass.png
**Prompt completo:**
> Seamless tileable hand-painted 2.5D game ground texture, Studio-Ghibli-meets-Stardew-Valley illustration style, lush green meadow grass with tiny wildflowers and clover, soft warm palette, top-down view, even flat lighting, no shadows, no objects, no characters, no text, edges tile perfectly (repeats with no visible seam), high detail, 1024x1024.

**Para qué:** el pasto del mundo en las eras tempranas (Paleolítico, Mesolítico, Neolítico). Es el suelo base verde.

---

## 2) ground_dirt.png
**Prompt completo:**
> Seamless tileable hand-painted 2.5D game ground texture, Studio-Ghibli-meets-Stardew-Valley illustration style, packed earth dirt path, warm brown soil with small scattered pebbles and faint footpath wear, soft warm palette, top-down view, even flat lighting, no shadows, no objects, no characters, no text, edges tile perfectly (repeats with no visible seam), high detail, 1024x1024.

**Para qué:** los caminos de tierra y el suelo de eras antiguas/medievales. Es el "camino" por donde camina la gente.

---

## 3) ground_cobble.png
**Prompt completo:**
> Seamless tileable hand-painted 2.5D game ground texture, Studio-Ghibli-meets-Stardew-Valley illustration style, old cobblestone paving made of rounded grey-brown stones with little tufts of grass growing in the cracks, soft warm palette, top-down view, even flat lighting, no shadows, no objects, no characters, no text, edges tile perfectly (repeats with no visible seam), high detail, 1024x1024.

**Para qué:** las calles empedradas de las eras clásica/medieval en adelante (cuando el pueblo "moderniza" sus calles).

---

## 4) sky.png
**Prompt completo:**
> Hand-painted Studio-Ghibli sky panorama, soft blue gradient with gentle fluffy cream-colored clouds, warm dreamy daylight, peaceful, no ground, no horizon line, no characters, no objects, no text, seamless horizontal wrap (left edge matches right edge), 2048x512.

**Para qué:** la cúpula del cielo en la vista 2.5D/3D de posesión. Reemplaza el degradé plano actual por un cielo pintado.

---

# (Próximos lotes — todavía NO generar, primero validamos la escena)
- **Lote Casas:** `public/art/buildings/` — casas ilustradas por era × familia cultural.
- **Lote Biomas/Objetos:** `public/art/scene/` + `public/art/props/` — fondos por bioma/estación, animales, cultivos, cestas, cercas, fuego, mercado, árboles, rocas.
- **Lote Personas (último):** `public/art/people/` — personajes ilustrados por era × familia × rol × sexo × edad.

Ver el plan completo en `/ART_PLAN.md` (raíz del repo).
