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

# B · CASAS → `public/art/buildings/`
Vista 3/4 (frente + un lado), base centrada abajo. ~768px. Nombre: `{tier}_{tipo}.png`.

**Plantilla:** estilo base + *…a [DESCRIPCIÓN DE CASA], 3/4 view, base centered at bottom, single building.*

Hay **7 tiers** (épocas). Para cada tier, generá 2-3 tamaños (choza/casa/grande). Reemplazá [DESCRIPCIÓN] según la tabla:

| Tier (archivo prefijo) | choza | casa | grande/mansión |
|---|---|---|---|
| **prehist_** | small thatch-and-hide hut on poles | larger timber dwelling with a fur roof | big longhut of hides and bone |
| **bronze_** (neolítico/bronce) | small mud-and-thatch hut | wattle-and-daub house with thatched roof | larger stone-base house |
| **iron_** (hierro/clásico) | small clay house | classical stone-and-plaster house with tiled roof | columned villa |
| **medieval_** | small wattle hut | timber-frame medieval house | stone manor house |
| **early_** (renacimiento/ilustración) | modest brick cottage | brick townhouse with shutters | ornate manor |
| **industrial_** (industrial→info) | brick worker cottage | brick row house | townhouse, then small apartment block |
| **future_** | small modular pod | sleek glass home | neon high-tech tower |

**Prioridad:** generá primero **`prehist_choza.png` + `prehist_casa.png`** (el juego empieza ahí). Después subís de tier.

> Nota cultural: si querés que una familia cultural se vea distinta (japonesa, vikinga, etc.), agregale al prompt
> "japanese village house with curved tiled roof and lanterns" / "norse longhouse with carved wood" etc. y nombralo
> `{tier}_{familia}_{tipo}.png`. Pero para arrancar, con el tier genérico alcanza.

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
