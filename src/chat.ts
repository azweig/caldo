// chat.ts — talk to any creature. v0 voice is derived from its genome + life state (age, illness,
// hunger, family) so a sick elder sounds different from a healthy child. respond() is async on
// purpose: later it swaps to a real LLM call (local Ollama / the Puglit GPU box) unchanged.

import { Creature, ageYears } from "./world"

export interface Persona { archetype: string; mood: string }

export function persona(c: Creature): Persona {
  const g = c.genome
  const ay = ageYears(c)
  const fast = g.speed > 1.8, big = g.size > 1.6, slow = g.speed < 0.9, sharp = g.vision > 140

  let archetype = "un ser del caldo"
  if (ay < 16) archetype = "una cría"
  else if (ay > 65) archetype = "un anciano"
  else if (fast && g.size < 1) archetype = "un corredor inquieto"
  else if (big && slow) archetype = "un coloso tranquilo"
  else if (sharp) archetype = "un observador atento"
  else archetype = "un adulto del caldo"

  let mood = "tranquilo"
  if (c.sick) mood = "enfermo, le cuesta"
  else if (c.energy < 32) mood = "con hambre, débil"
  else if (c.energy > 100) mood = "saciado y fuerte"

  return { archetype, mood }
}

const P = {
  saludo: ["¿Quién anda ahí? No te vi antes en el caldo.", "Hola, criatura. ¿También buscás comida?", "Mmh. Otro que respira. Hola."],
  hambre: ["Tengo hambre... cada paso me cuesta. ¿Viste comida cerca?", "Me queda poca energía. Si no como pronto, me apago."],
  saciado: ["Estoy fuerte hoy. La vida en el caldo es buena.", "Lleno de energía. Quizás pronto tenga otra cría."],
  enfermo: ["No me siento bien... algo me agarró. Espero recuperarme.", "Estoy enfermo. Tengo frío y se me va la fuerza. Ojalá pase."],
  filosofia: ["Nadie nos dijo cómo vivir. Solo los que comen a tiempo siguen acá.", "Mutamos un poco en cada hijo. Eso, con los años, lo es todo.", "No hay plan. El que sobrevive deja huella. Así de simple."],
  cria: ["Acabo de nacer. Todo es nuevo. ¿Qué se come?", "Soy joven. Mis padres andan por acá, creo."],
  anciano: ["He visto muchas estaciones. Pronto me tocará descansar.", "Viví casi toda mi vida. Mis hijos seguirán cuando yo no esté."],
}
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]

export async function respond(c: Creature, message: string): Promise<string> {
  const m = message.toLowerCase()
  const ay = Math.round(ageYears(c))
  if (c.sick && /enferm|salud|bien|estás|estas|cómo|como te/.test(m)) return pick(P.enfermo)
  if (/edad|años|anos|cuánto|cuantos|viejo|joven/.test(m)) return `Tengo ${ay} años. ${ay > 65 ? "Ya soy de los viejos del caldo." : ay < 16 ? "Todavía soy una cría." : "Estoy en mi plenitud."}`
  if (/hijo|cría|cria|famil|apellido|padre|madre/.test(m)) {
    if (c.children > 0) return `Soy de los ${c.surname}. Tuve ${c.children} ${c.children === 1 ? "hijo" : "hijos"}. La sangre sigue.`
    if (c.parents) return `Soy ${c.name} de los ${c.surname}. Todavía no tuve crías, pero vengo de un linaje.`
    return `Soy de los ${c.surname}. Aún no formé familia.`
  }
  if (/enferm|salud/.test(m)) return c.sick ? pick(P.enfermo) : "Por ahora estoy sano, gracias."
  if (/quién|quien|sos|eres|nombre/.test(m)) return `Soy ${c.name} ${c.surname}, ${persona(c).archetype} de ${ay} años.`
  if (/hola|buenas|saludo|hey|ey/.test(m)) return pick(P.saludo)
  if (/comida|comer|hambre|energ/.test(m)) return c.energy > 100 ? pick(P.saciado) : pick(P.hambre)
  if (c.sick) return pick(P.enfermo)
  if (ay < 16) return pick(P.cria)
  if (ay > 65) return pick(P.anciano)
  if (c.energy < 32) return pick(P.hambre)
  return pick(P.filosofia)
}

export function greeting(c: Creature): string {
  const p = persona(c)
  const fam = c.children > 0 ? ` · ${c.children} ${c.children === 1 ? "hijo" : "hijos"}` : ""
  return `${c.name} ${c.surname} — ${p.archetype}, ${Math.round(ageYears(c))} años${fam}. (${p.mood})`
}
