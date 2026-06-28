# FASE 4 — Interiores de casas (Ghibli, por época)

Idea: al ENTRAR a una casa ves una **escena de interior pintada** (un cuarto acogedor con muebles, cocina,
objetos, decoración — todo según la época). La gente que está adentro se dibuja como sprites parada en ese cuarto.
Es lo más hermoso y cohesivo (un solo arte por época en vez de muebles sueltos).

Carpeta: `public/art/interiors/` · **SIN transparencia** (es una escena completa) · ~1536×1024 (apaisado, llena la
vista) · sin texto ni marca de agua. Yo le saco marca de agua si hace falta + comprimo.

Cada prompt está COMPLETO (copiá el bloque `> …` entero).

---

## interior_prehist.png  (PRIORIDAD — el juego empieza acá)
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley interior scene, the cozy inside of a prehistoric hut, view from inside looking at the back and side walls, a crackling central fire pit with a pot, animal furs and hides as bedding on the ground, woven baskets, drying herbs and meat hanging from wooden poles, stone tools, clay pots, warm firelight glow, dirt floor, inviting and lived-in, no characters, no text, no watermark, wide landscape composition.

## interior_bronze.png  (neolítico / bronce)
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley interior scene, the cozy inside of a neolithic mud-and-thatch house, view looking at the back and side walls, a clay hearth with a cooking pot, a simple wooden bed with woven blankets, clay storage jars, woven baskets of grain, hanging herbs, a low wooden table with bowls, warm daylight from a small window, packed-earth floor, lived-in and warm, no characters, no text, no watermark, wide landscape composition.

## interior_iron.png  (hierro / clásico)
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley interior scene, the cozy inside of a classical stone house, view of the back and side walls, a stone hearth with a kettle, a wooden bed with linen, amphorae and clay jars, a wooden table with bread and a bowl of fruit, oil lamps, shelves with pottery, warm light, tiled floor, homely, no characters, no text, no watermark, wide landscape composition.

## interior_medieval.png  (medieval)
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley interior scene, the cozy inside of a medieval timber-frame house, view of the back and side walls, a stone fireplace with a hanging cauldron, a wooden bed with a quilt, a sturdy table with bread, cheese and a candle, barrels and sacks, hanging dried herbs and onions, a spinning wheel, warm firelight, wooden floor, rustic and warm, no characters, no text, no watermark, wide landscape composition.

## interior_early.png  (renacimiento / ilustración)
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley interior scene, the cozy inside of an early-modern brick house, view of the back and side walls, a tiled stove or fireplace, a four-poster bed, a writing desk with books, candlesticks and an inkwell, a dresser with porcelain, framed pictures, warm lamp light, wooden floor with a rug, refined and homely, no characters, no text, no watermark, wide landscape composition.

## interior_industrial.png  (industrial / moderno)
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley interior scene, the cozy inside of an industrial-era home, view of the back and side walls, a cast-iron stove in a small kitchen, a bed with a blanket, a table with a kettle and cups, shelves with jars and books, an oil or early electric lamp, patterned wallpaper, wooden floor with a rug, warm and homely, no characters, no text, no watermark, wide landscape composition.

## interior_future.png  (futuro)
> Soft hand-painted Studio-Ghibli-meets-Stardew-Valley interior scene, the cozy inside of a futuristic home, view of the back and side walls, a sleek kitchen unit with soft glowing panels, a floating bed, a holographic display, indoor plants, soft ambient teal and warm light, clean minimalist furniture, smooth floor, warm and inviting despite the tech, no characters, no text, no watermark, wide landscape composition.

---

# Cómo lo voy a usar (código, lo hago yo)

Cuando tengas al menos `interior_prehist.png`, cableo:
1. **Al entrar**, el cuarto 3D actual se reemplaza por la **escena pintada** de la época (fondo + un piso donde
   parás), y la gente de adentro se dibuja como sprites.
2. **Click en una casa + permiso para entrar**, con estas reglas:
   - Sos el **dueño** de la casa → entrás siempre.
   - Es de tu **familia** → entrás.
   - Te **conocen** (te tienen en su memoria social / relación) → te dejan pasar.
   - Si no te conocen → te lo niegan ("la puerta está cerrada").
3. (Más adelante) varios **cuartos** por casa grande — pero arrancamos con un cuarto hermoso por época.

---

# RESUMEN
- **7 interiores** (1 por época) — empezá por `interior_prehist.png`.
- Apenas esté, cableo entrar-con-permiso + la escena pintada adentro. Probás, y sumamos las otras épocas.
