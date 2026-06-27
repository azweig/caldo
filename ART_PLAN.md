# Plan de arte 2.5D — caldo

Objetivo: pasar del render procedural a un look **ilustrado 2.5D** (estilo Ghibli / Stardew / RimWorld bonito),
con personajes, casas, biomas y objetos pre-generados (con Gemini) que el motor **elige + tiñe + compone** en
tiempo real. La simulación ("el cerebro") ya corre para todos; solo se **dibuja** lo que está en rango de vista.

---

## 0. Principio rector: FACTORIZAR (no 55×19)

Hacer un sprite único por (55 culturas × 19 eras × roles × sexo × edad) = miles inviables.
En vez de eso, factorizamos en dimensiones COMPARTIDAS:

- **19 eras → 7 tiers de arte** (la ropa/tecnología cambia por tier, no por cada era).
- **55 culturas → 7 familias visuales** (comparten "look"; el detalle cultural se da con tinte + accesorios).
- Roles, sexo y edad: pocos valores.

Resultado: ~**cientos** de sprites para cobertura total, no miles. Y arrancamos por UN tier × UNA familia
para validar el pipeline antes de generar todo.

---

## 1. Los 7 TIERS de arte (mapa era → tier)

| Tier | Nombre | Eras del juego (índices) |
|---|---|---|
| T1 | **Prehistórico** | Paleolítica, Mesolítica (0–1) |
| T2 | **Neolítico/Bronce** | Neolítica, Edad de Bronce (2–3) |
| T3 | **Hierro/Clásico** | Edad de Hierro, Clásica (4–5) |
| T4 | **Medieval** | Medieval (6) |
| T5 | **Moderno temprano** | Renacimiento, Ilustración (7–8) |
| T6 | **Industrial/Moderno** | Industrial, Eléctrica, Atómica, Informática (9–12) |
| T7 | **Futuro** | Espacial, Biotec, Nanotec, IA, Posthumana, Galáctica (13–18) |

(El motor ya tiene `eraTier()` — lo ajustamos a estos 7.)

---

## 2. Las 7 FAMILIAS culturales (mapa de las 55 culturas)

| Familia | Culturas que agrupa (ejemplos) |
|---|---|
| **Ártica** | Inuit |
| **Europea** | Nórdica, Celta, Anglosajona, Romana, Griega, Minoica, Etrusca, Bizantina |
| **Mesoamericana** | Inca, Azteca, Maya, Olmeca, Tolteca |
| **Asiática oriental** | Han, Japonesa, Coreana |
| **Africana** | Egipcia, Nubia |
| **Medio-oriente** | Persa, Babilónica, Sumeria, Asiria, Hitita, Árabe, Otomana, Fenicia, Cartaginesa, Hebrea |
| **Estepa nómada** | Mongola, Escita |

Nota: en **tiers tempranos (T1–T2)** las culturas casi no difieren visualmente (humanos universales con pieles/cuero).
Ahí alcanza con **1–2 familias** (frío/ártico vs templado). La divergencia cultural crece de T3 en adelante.
En el **futuro (T7)** vuelve a homogeneizarse (global). → menos sprites en los extremos, más en el medio.

---

## 3. Roles, sexo, edad (personas)

- **Rol/clase** (5, por la ropa): `aldeano` (trabajador/comida/construcción/oficio), `guerrero` (defensa),
  `erudito` (saber/enseñanza/espíritu/salud → túnica/sacerdote), `mercader` (comercio/liderazgo → noble/fino),
  `niño` (es por edad, ropa simple).
- **Sexo** (2): `m`, `f`.
- **Edad** (3): `nino`, `adulto`, `anciano`.

Set mínimo por (tier × familia): **7 sprites** → `m/f × {aldeano, erudito, mercader}` + `guerrero` + `niño` + `anciano`.
Cobertura total: ~7 tiers × ~7 familias × 7 = **~343 sprites de personas** (menos en los extremos).

---

## 4. Convención de nombres + specs técnicas

**Personas:** `public/art/people/{tier}_{familia}_{rol}_{sexo}_{edad}.png`
ej. `prehist_arctic_aldeano_m_adulto.png`, `bronze_europe_guerrero_m_adulto.png`

**Casas:** `public/art/buildings/{tier}_{familia}_{tamaño}.png` (tamaños: `choza, casa, casona, mansion, edificio`)
ej. `prehist_arctic_choza.png`

**Biomas (fondo/suelo):** `public/art/scene/{bioma}_{estacion}.png`
biomas: `tundra, bosque, pradera, desierto, selva, costa, montaña` · estaciones: `prim, ver, oto, inv`

**Props/objetos:** `public/art/props/{nombre}.png`
animales: lobo, oso, ciervo, conejo, oveja, cabra, vaca, caballo, perro · + cultivos, cestas, secaderos de pescado,
cercas, fuego/hogar, fuente, puesto de mercado, árboles, rocas, herramientas, vasijas, etc.

**Specs de cada sprite:**
- PNG con **fondo transparente** (alpha), recortado.
- **Personas:** retrato ~**512×768** (vertical), **cuerpo entero**, vista **3/4 frontal** (mirando levemente
  hacia la cámara), **pies en el centro-abajo** (punto de anclaje), iluminación plana/suave, sin sombra propia
  (la pone el motor).
- **Casas:** ~**768×768**, vista 3/4 (frente + un lado), base centrada.
- **Estilo CONSISTENTE** entre todos: misma paleta, mismo grosor de línea, mismo "render". Para eso, fijamos un
  **prompt base de estilo** (abajo) y solo cambiamos el sujeto.

---

## 5. PROMPT BASE de estilo (pegar al inicio de TODOS)

> *Soft hand-painted 2.5D game art, Studio-Ghibli-meets-Stardew-Valley illustration, warm cohesive palette, gentle
> cel-shading with soft outlines, isometric-ish 3/4 view, single subject centered, full body, transparent
> background (PNG alpha), no scene, no text, clean cutout, consistent lighting from upper-left.*

Después se le agrega el sujeto específico (ver lotes).

---

## 6. Categorías y volumen (cobertura total, aprox.)

| Categoría | Cómo se factoriza | Sprites aprox. |
|---|---|---|
| Personas | 7 tier × 7 familia × 7 rol/sexo/edad (menos en extremos) | ~300–350 |
| Casas | 7 tier × 7 familia × 3–5 tamaños | ~150 |
| Biomas/fondos | 7 biomas × 4 estaciones | ~28 |
| Animales | 9 especies × 1–2 estados | ~15 |
| Props/objetos | cultivos, cestas, cercas, hogar, mercado, árboles, rocas, herramientas… | ~150 |
| **Total** | | **~650 sprites** |

(Mucho, pero finito y generable de a lotes. Empezamos por 1 lote y escalamos.)

---

## 7. Orden de batalla ("matar de a una")

1. **Lote 1 — Prehistórico × (universal frío)**: arrancamos acá (el juego empieza en Paleolítico para todos).
   Validamos el pipeline: 7 personas + 2 casas + 1 bioma + props básicos.
2. Lote 2 — Neolítico/Bronce × Europea (lo de las refes).
3. Lote 3 — biomas + animales (sirven a todos los tiers).
4. Lote 4+ — ir sumando familias × tiers según las civilizaciones que más juegues.

---

## 8. Animación (movimiento con sprites)

El usuario quiere que se muevan. Plan:
- **Fase 1 (barata):** 1 sprite por personaje (idle 3/4) + animación PROCEDURAL del motor: bob vertical al caminar,
  leve squash/stretch, flip horizontal según dirección, sombra que sigue. Se nota vivo sin generar frames.
- **Fase 2 (opcional):** 2–3 poses por personaje (idle, paso-A, paso-B) para un walk cycle real. Solo si hace falta.

Off-screen: NO se renderiza (ya es así) — el "cerebro" simula a todos; solo dibujamos lo que está en rango.

---

## 9. Cómo se enchufa al motor

- Cargador de atlas: indexa `people/{tier}_{familia}_{rol}_{sexo}_{edad}.png` y los cachea.
- El render 2D dibuja el sprite como **billboard** con depth-sort por `y` (ya existe el scratch `_folk`).
- Tinte por individuo: un leve `hue/brightness` desde el genoma → variedad dentro del mismo sprite (que no se vean clones).
- Posesión 2.5D: misma vista, cámara que sigue + sigues viendo a los cercanos; entrar a una casa = escena interior.
- Fallback: si falta un sprite, cae al procedural actual (no se rompe nada).

---

## 10. Lo que necesito de vos

Generás en Gemini con los prompts de cada lote (fondo transparente), nombrás según la convención, y dejás los PNG
en `public/art/...`. Yo cableo el cargador + el render + el tinte + la posesión. Iteramos lote por lote.
