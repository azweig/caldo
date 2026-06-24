# caldo

Un **simulador de vida artificial evolutivo**. Un pueblo cero-jugador que evoluciona solo: criaturas con genoma que forrajean, caminan las calles hacia su casa, envejecen (~80 años), se enferman al azar, forman familias y mueren — y la **selección natural** hace emerger comportamiento y complejidad. Vos entrás como **una criatura mortal más** (sin poderes) y podés **conversar con cualquiera**.

Inspirado en Tierra, SimLife, las criaturas de Karl Sims y el Game of Life — más cerca de la biología digital que de The Sims.

## Correr (local)

```bash
npm install
npm run dev
```

Abrí http://localhost:5173

## Probar en un pod (RunPod) — un comando

```bash
git clone https://github.com/azweig/caldo && cd caldo
bash setup.sh
```

Instala Node, buildea, asegura Ollama + un modelo de chat (`qwen2.5:7b`) y sirve la app + un proxy de
Ollama **en un solo puerto** (sin CORS, sin tocar el Ollama de Puglit). Después:

1. Exponé el puerto **4321** en RunPod (Edit Pod → HTTP Ports).
2. Abrí `https://<tu-pod>-4321.proxy.runpod.net`.
3. En **⚙** poné URL = `https://<tu-pod>-4321.proxy.runpod.net/ollama`, modelo `qwen2.5:7b` → probar → guardar.

Sin LLM, igual juega con la voz simple. Variables: `PORT`, `CALDO_MODEL`.

## Controles

- **WASD / flechas** — mover tu avatar
- **E** — hablar con quien tengas cerca (pausa el mundo)
- **scroll** — zoom
- **espacio** — pausa · **slider** — velocidad del tiempo (1 semana/s → 2½ años/s)
- **R** — re-entrar si moriste

## Cómo funciona

- **Genoma** heredable: velocidad, visión, tamaño, metabolismo, **longevidad**, **resistencia** a enfermedad, sprite, color de linaje.
- **Economía de energía**: forrajean en jardines, gastan energía moviéndose; mutación + selección sobre quién junta energía para reproducirse.
- **Familias**: dos adultos (16+) de una casa → hijo que **recombina los genes de ambos** + apellido + linaje.
- **Pueblo**: mapa grande con grilla de **calles** y **casas** (una familia por casa); cámara con zoom que sigue al avatar.
- El **gráfico** en vivo muestra el promedio del genoma cambiando — la evolución pasando.

## Roadmap

- [x] v0: mundo evolutivo + avatar + chat por personalidad
- [x] tiempo en días, vida ~80 años, enfermedades, familias
- [x] pueblo con calles, casas y cámara/zoom
- [ ] **NPCs con LLM**: personalidad + memoria + voz fluida (Ollama self-hosted) — en progreso
- [ ] árbol genealógico, plaza/mercado, depredadores, cerebros neuronales

Sprites pixel-art reusados del proyecto Puglit.

## Licencia

[MIT](LICENSE) © azweig
