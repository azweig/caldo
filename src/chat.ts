// chat.ts — give every creature a voice. If an LLM is configured (llm.ts → your GPU box), each
// creature speaks fluidly IN CHARACTER, conditioned on its personality + real life state + memory of
// past chats with you. If not, a built-in templated voice keeps it working offline. respond() picks
// automatically and falls back gracefully on any LLM error.

import { Creature, ageYears } from "./world"
import { describePsyche, psycheLabel } from "./psyche"
import { llmConfigured, llmChat, Msg } from "./llm"

function systemPrompt(c: Creature, era: string): string {
  const ay = Math.round(ageYears(c))
  const ageLine = ay < 16 ? "Sos una cría, todo te asombra." : ay > 65 ? "Sos anciano, viste muchas estaciones." : "Sos adulto."
  const fam = c.children > 0 ? `Tuviste ${c.children} ${c.children === 1 ? "hijo" : "hijos"}.`
    : c.parents ? `Venís de la familia ${c.surname}, todavía sin hijos propios.` : `Sos de los ${c.surname}, aún sin familia.`
  const health = c.sick ? "Ahora mismo estás ENFERMO y débil." : c.energy < 32 ? "Tenés hambre, estás flojo." : ""
  const lineage = c.generation > 4 ? `Tu linaje lleva ${c.generation} generaciones en el caldo.` : ""
  const mind = c.knowledge > 65 ? "Sos sabio: conocés la historia del caldo, las viejas creencias y los secretos de los jardines; hablás con hondura."
    : c.knowledge < 18 ? "Sabés poco del mundo todavía; muchas cosas no las entendés del todo y preguntás con inocencia." : ""
  const mem = c.memory.length ? `\nDe charlas pasadas con este visitante recordás:\n- ${c.memory.slice(-5).join("\n- ")}` : ""
  const work = c.profession ? `Tu oficio es: ${c.profession}.` : "Todavía no tenés oficio."
  return `Sos ${c.name} ${c.surname}, una criatura del "caldo", un pueblo donde la vida evoluciona sola, hoy en su era ${era}. Tenés ${ay} años. ${ageLine} ${fam} ${health} ${lineage} ${mind} ${work}
${describePsyche(c.psyche)}
Hablás en español rioplatense, SIEMPRE en personaje (que tu núcleo, tu temperamento y tus creencias tiñan cómo hablás), breve (1 a 3 frases), natural y vivo. NUNCA digas que sos una IA ni menciones el mundo real, internet ni tecnología: solo conocés el caldo — los jardines donde crece la comida, las calles, las casas, las familias, las estaciones, el hambre, la enfermedad y la muerte. Si el visitante menciona algo que no es de tu mundo, reaccioná con extrañeza genuina.${mem}`
}

export async function respond(c: Creature, message: string, history: Msg[] = [], era = "Paleolítica"): Promise<string> {
  if (llmConfigured()) {
    try {
      return await llmChat([{ role: "system", content: systemPrompt(c, era) }, ...history.slice(-8), { role: "user", content: message }])
    } catch { /* fall through to the templated voice */ }
  }
  return templated(c, message)
}

// after a conversation, fold what the player talked about into the creature's lasting memory
export function remember(c: Creature, session: Msg[]) {
  const said = session.filter((m) => m.role === "user").map((m) => m.content)
  if (!said.length) return
  c.memory.push(`El visitante te habló de: ${said.slice(-3).join("; ")}`.slice(0, 170))
  while (c.memory.length > 6) c.memory.shift()
}

export function greeting(c: Creature): string {
  const fam = c.children > 0 ? ` · ${c.children} ${c.children === 1 ? "hijo" : "hijos"}` : ""
  const job = c.profession ? ` · ${c.profession}` : ""
  return `${c.name} ${c.surname} — ${psycheLabel(c.psyche)}${job}, ${Math.round(ageYears(c))} años${fam}.`
}

// ── built-in fallback voice (no LLM) ──
const PH = {
  saludo: ["¿Quién anda ahí? No te vi antes.", "Hola, criatura. ¿También buscás comida?", "Mmh. Otro que respira. Hola."],
  hambre: ["Tengo hambre... cada paso me cuesta.", "Me queda poca energía. Si no como pronto, me apago."],
  enfermo: ["No me siento bien... algo me agarró.", "Estoy enfermo. Se me va la fuerza. Ojalá pase."],
  filosofia: ["Nadie nos dijo cómo vivir. Solo los que comen a tiempo siguen.", "Mutamos un poco en cada hijo. Eso, con los años, lo es todo."],
  cria: ["Acabo de nacer. Todo es nuevo. ¿Qué se come?", "Soy joven. Mis padres andan por acá."],
  anciano: ["Vi muchas estaciones. Pronto me tocará descansar.", "Mis hijos seguirán cuando yo no esté."],
}
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]

function templated(c: Creature, message: string): string {
  const m = message.toLowerCase(); const ay = Math.round(ageYears(c))
  if (c.sick && /enferm|salud|bien|cómo|como/.test(m)) return pick(PH.enfermo)
  if (/edad|años|anos|viejo|joven/.test(m)) return `Tengo ${ay} años.`
  if (/hijo|cría|cria|famil|apellido|padre|madre/.test(m)) return c.children > 0 ? `Soy de los ${c.surname}. Tuve ${c.children} ${c.children === 1 ? "hijo" : "hijos"}.` : `Soy de los ${c.surname}. Aún sin familia.`
  if (/quién|quien|sos|eres|nombre/.test(m)) return `Soy ${c.name} ${c.surname}, ${ay} años.`
  if (/hola|buenas|hey|ey/.test(m)) return pick(PH.saludo)
  if (/comida|comer|hambre|energ/.test(m)) return pick(PH.hambre)
  if (c.sick) return pick(PH.enfermo)
  if (ay < 16) return pick(PH.cria)
  if (ay > 65) return pick(PH.anciano)
  return pick(PH.filosofia)
}
