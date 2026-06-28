# FASE 3 — Animación de personas (fluidez) + variantes faltantes

Objetivo: que los villagers caminen y parpadeen con naturalidad. La clave para que las animaciones NO salten:
**sprite sheets** (varios frames alineados en UNA imagen) en vez de imágenes sueltas. Yo los corto por UV y los
animo. Solo PERSONAS por ahora.

Carpeta: `public/art/people/` · fondo transparente · yo hago rembg + compresión.

---

## A · SHEETS DE CAMINATA (lo más importante para la fluidez)

Un sheet por personaje: **4 frames en una FILA horizontal** (idle, paso-izq, idle, paso-der), MISMO personaje,
MISMO tamaño y posición en cada frame (alineados), pies a la misma altura. Nombre: `{personaje}_walk.png`.

**Prompt (reemplazá [PERSONAJE] por la descripción de cada uno, igual a la del idle que ya generaste):**
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley game art, a horizontal sprite sheet of exactly 4 evenly-spaced walk-cycle frames of [PERSONAJE], frames in a single row, SAME character at the SAME size and SAME position in every frame, feet aligned on the same baseline, full body, 3/4 front view, legs in walking stride poses (contact, passing, contact, passing), warm palette, soft outlines, transparent background PNG alpha, no scene, no ground, no text, no watermark, evenly spaced frames.

[PERSONAJE] para cada archivo:
- `prehist_aldeano_m_adulto_walk.png` → *a ~30yo male prehistoric hunter-gatherer in rough furs and hide*
- `prehist_aldeano_f_adulto_walk.png` → *a ~30yo female prehistoric gatherer in a fur-and-hide wrap*
- `prehist_guerrero_m_adulto_walk.png` → *a ~35yo prehistoric hunter-warrior in thick furs holding a stone spear*
- `prehist_erudito_m_adulto_walk.png` → *a ~50yo prehistoric tribal shaman in furs with bones and feathers*
- `prehist_nino_walk.png` → *a ~8yo prehistoric child in a small fur tunic, barefoot*
- `prehist_anciano_m_adulto_walk.png` → *a ~65yo prehistoric elder man, grey hair and beard, worn furs*
- `prehist_anciana_f_adulto_walk.png` → *a ~65yo prehistoric elder woman, grey hair, fur wrap*

→ 7 sheets. Con esto el motor alterna los frames cuando caminan = caminata fluida.

---

## B · PARPADEO (opcional, suma vida)

Un solo frame por personaje con los **ojos cerrados** (idéntico al idle pero parpadeando). El motor lo mete cada
varios segundos. Nombre: `{personaje}_blink.png`.

**Prompt:** el MISMO prompt del idle que ya generaste, pero agregando *…with eyes gently closed (blinking), exact
same pose, size and position as the idle…*

(7 archivos: `prehist_aldeano_m_adulto_blink.png`, etc. Si te parece mucho, generá solo el del aldeano m/f para probar.)

---

## C · VARIANTES DE ROL/SEXO que FALTAN (las noté al cablear)

Hoy mapeo: aldeano m/f, guerrero (solo m), erudito (solo m), niño (genérico), anciano/a. Faltan para cobertura
completa del pueblo prehist (idle, 3/4 frontal, como los demás):

- `prehist_guerrero_f_adulto.png` → *a ~35yo female prehistoric hunter-warrior in furs holding a stone spear*
- `prehist_erudito_f_adulto.png` → *a ~50yo female prehistoric tribal shaman in furs with bones and feathers*
- `prehist_mercader_m_adulto.png` → *a ~40yo male prehistoric trader in furs with pouches, beads and trade goods*
- `prehist_mercader_f_adulto.png` → *a ~40yo female prehistoric trader in furs with pouches and beads*
- `prehist_nina.png` → *a ~8yo prehistoric girl in a small fur tunic, barefoot* (la niña; hoy uso `prehist_nino` para ambos)

→ 5 sprites. Con esto cada oficio/sexo tiene su propia figura.

**Prompt base** (para los 5): el mismo formato de las personas del `PROMPTS_FASE2.md` (estilo Ghibli, cuerpo
entero, 3/4 frontal, pies centrados, fondo transparente) + la descripción de arriba.

---

# RESUMEN
- **A · 7 sheets de caminata** ← prioridad, da la fluidez
- **B · 7 blink** (opcional)
- **C · 5 variantes faltantes** (guerrero_f, erudito_f, mercader m/f, niña)

**Arrancá con A (los 7 walk sheets).** Apenas estén, cableo la animación de frames (idle ↔ caminata) y vas a ver
a la gente caminar con piernas, no deslizándose. Después B y C.
