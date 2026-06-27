# FASE 2 — Casas + Personas + Animales (todos los prompts)

## 🎯 Decisión de ángulos (la pensé, esto es lo que conviene)

Los sprites son **billboards** (siempre miran a la cámara). Entonces:

- **Personas → 1 vista 3/4 FRONTAL.** El motor la **espeja** para izquierda/derecha. NO hace falta vista de
  espalda para empezar — en las referencias los personajes miran de frente y se ve perfecto. Si más adelante
  molesta cuando caminan "hacia el norte", sumamos una vista de espalda como 2da tanda. **Por ahora: 1 ángulo.**
- **Animales → 1 vista de PERFIL (costado).** Espejo para izq/der. El perfil es lo natural para un cuadrúpedo
  (de frente se ven raros). **1 ángulo.**
- **Casas → 1 vista 3/4** (frente + un lado). No rotan. **1 ángulo.**

→ **1 ángulo por asset.** Mantiene la cantidad manejable y se ve bien en 2.5D. (Si querés calidad máxima después,
la 2da tanda sería: personas de espalda + animales de frente. Pero arrancá con 1.)

**No te preocupes por el fondo:** yo les hago rembg (recorte) + compresión automática. Solo pedí "transparent background".

---

## 🎨 ESTILO BASE (pegá esto al inicio de TODOS)
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley game art, warm cohesive palette, gentle cel-shading with
> soft outlines, clean cutout, transparent background (PNG alpha), single subject centered, no scene, no ground,
> no text, no watermark.

---

# A · ANIMALES que faltan (7) → `public/art/scene/`
Perfil de costado, parado, patas abajo. *(deer + rabbit ya están)*. ~512px.

| Archivo | Agregar al estilo base |
|---|---|
| `animal_wolf.png` | *…a grey wolf standing in side profile, alert* |
| `animal_bear.png` | *…a brown bear standing on four legs, side profile* |
| `animal_sheep.png` | *…a fluffy white sheep, side profile* |
| `animal_goat.png` | *…a goat with horns, side profile* |
| `animal_cow.png` | *…a brown-and-white cow, side profile* |
| `animal_horse.png` | *…a horse standing, side profile* |
| `animal_dog.png` | *…a friendly dog standing, side profile* |

---

# B · CASAS → `public/art/tex/`  (TEXTURAS, no sprites)

**Las casas NO son sprites** — son cajas 3D que rodeás. Así que en vez de 4 lados, generás **texturas pintadas
de PARED y TECHO** (tileables) que yo aplico sobre la geometría 3D que ya existe. Funciona en 360°, igual que el
pasto. Mucho menos trabajo, mejor resultado.

**🟩 Tileables, SIN transparencia, sin costura** (como los suelos). ~512×512. Nombre: `{material}.png`.

**Plantilla pared:** estilo base + *seamless tileable [PARED] wall texture, top-down flat lighting, no shadows, no
objects, no text, edges tile perfectly.*
**Plantilla techo:** igual pero *…[TECHO] roof texture…*

| Tier | PARED (archivo) | TECHO (archivo) |
|---|---|---|
| **prehist** | rough mud-and-wattle wall → `wall_mud.png` | thatch / straw roof → `roof_thatch.png` |
| **bronze** | timber log wall → `wall_wood.png` | thatch roof → *(reusa roof_thatch)* |
| **iron/clásico** | stone block wall → `wall_stone.png` | clay tile roof → `roof_clay.png` |
| **medieval** | plaster-and-timber wall → `wall_plaster.png` | wooden shingle roof → `roof_shingle.png` |
| **renacimiento** | brick wall → `wall_brick.png` | slate roof → `roof_slate.png` |
| **industrial** | concrete wall → `wall_concrete.png` | metal roof → `roof_metal.png` |
| **futuro** | glass-panel wall → `wall_glass.png` / neon → `wall_neon.png` | metal roof → *(reusa roof_metal)* |

**Prioridad:** generá primero **`wall_mud.png` + `roof_thatch.png`** (prehist). Con eso ya ves las casas ilustradas.

> Estos nombres son los MISMOS que el motor ya usa (`/tex/wall_mud.png`, etc.) — los tuyos, pintados a mano,
> **reemplazan** los actuales. Dejalos en `public/art/tex/` y yo hago que high mode los prefiera (fallback al actual).

> (Opcional, más adelante) Si querés casas con FORMA distinta por cultura — techo japonés curvo, longhouse vikinga —
> eso es geometría 3D nueva, lo vemos en otra fase. Por ahora la textura pintada ya da el salto Ghibli.

---

# C · PERSONAS → `public/art/people/`
Cuerpo entero, vista 3/4 FRONTAL, pies centrados abajo. ~512×768 (vertical). Nombre: `{tier}_{rol}_{sexo}_{edad}.png`.

**Plantilla:** estilo base + *…a [EDAD+SEXO] [ROL] of the [ÉPOCA], wearing [ROPA], full body, 3/4 front view standing, feet centered at bottom, single character.*

### Variables para llenar:

**ÉPOCA + ROPA por tier:**
| Tier (prefijo) | época + ropa base |
|---|---|
| **prehist_** | prehistoric era, wearing rough furs and hide |
| **bronze_** | neolithic/bronze-age, wearing woven linen tunic |
| **iron_** | iron-age/classical, wearing draped tunic or simple robe |
| **medieval_** | medieval, wearing wool tunic and cloak |
| **early_** | renaissance/early-modern, wearing a coat and breeches |
| **industrial_** | industrial era, wearing simple work clothes |
| **future_** | futuristic, wearing a sleek bodysuit |

**ROL (cambia la ROPA/accesorio):**
| rol (en archivo) | añadir |
|---|---|
| `aldeano` | (la ropa base del tier, simple) |
| `guerrero` | + armed with a spear/weapon, tougher gear |
| `erudito` | + as a shaman/scholar/priest with robes and trinkets |
| `mercader` | + as a well-dressed merchant/noble, finer clothes |

**SEXO:** `m` (male) / `f` (female) · **EDAD:** `nino` (child ~8yo) / `adulto` (~30yo) / `anciano` (elder ~65yo, grey hair)

### TANDA 1 (PREHIST — generá estos 7 primero):
1. `prehist_aldeano_m_adulto.png` → *…a ~30yo male prehistoric hunter-gatherer, wearing rough furs and hide…*
2. `prehist_aldeano_f_adulto.png` → *…a ~30yo female prehistoric gatherer, wearing fur-and-hide wrap…*
3. `prehist_guerrero_m_adulto.png` → *…a ~35yo prehistoric hunter-warrior in thick furs, holding a stone-tipped spear…*
4. `prehist_erudito_m_adulto.png` → *…a ~50yo prehistoric tribal shaman, furs with bones and feathers, bone necklace…*
5. `prehist_nino.png` → *…a ~8yo prehistoric child in a small fur tunic, barefoot…*
6. `prehist_anciano_m_adulto.png` → *…a ~65yo prehistoric elder man, grey hair and beard, worn furs…*
7. `prehist_anciana_f_adulto.png` → *…a ~65yo prehistoric elder woman, grey hair, fur wrap…*

Con esos 7 + las 2 casas prehist, **yo cableo el sistema completo de personas + casas** (elige el sprite por
era/rol/sexo/edad, espeja por dirección, fallback al procedural si falta). Lo probás, y si funciona escalás a los
otros tiers con la plantilla.

---

# RESUMEN de cantidades (con 1 ángulo)
- **Animales:** 7 que faltan (+ 2 ya)
- **Casas:** 7 tiers × ~3 tamaños = ~21 (mínimo; más si hacés variantes culturales)
- **Personas:** 7 tiers × 7 (rol/sexo/edad) = ~49 para cobertura total
- **Total fase 2:** ~77 sprites para TODO. Pero **arrancá con la Tanda 1 (7 personas + 2 casas prehist + 7 animales)**
  para validar, y después escalás tier por tier.

Cuando tengas la Tanda 1 lista en las carpetas, avisame y cableo casas + personas + animales completos.
