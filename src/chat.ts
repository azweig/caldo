// chat.ts — give every creature a voice. If an LLM is configured (llm.ts → your GPU box), each
// creature speaks fluidly IN CHARACTER, conditioned on its personality + real life state + memory of
// past chats with you. If not, a built-in templated voice keeps it working offline. respond() picks
// automatically and falls back gracefully on any LLM error.

import { Creature, ageYears } from "./world"
import { describePsyche, psycheLabel } from "./psyche"
import { llmConfigured, llmChat, Msg } from "./llm"
import { langName, LangCode } from "./i18n"

export interface ChatInfo { era: string; country: string; food: string; lang: LangCode }

function systemPrompt(c: Creature, era: string, lang: string, ctx: string): string {
  const ay = Math.round(ageYears(c))
  const ageLine = ay < 16 ? "Sos una cría, todo te asombra." : ay > 65 ? "Sos anciano, viste muchas estaciones." : "Sos adulto."
  const fam = c.children > 0 ? `Tuviste ${c.children} ${c.children === 1 ? "hijo" : "hijos"}.`
    : c.parents ? `Venís de la familia ${c.surname}, todavía sin hijos propios.` : `Sos de los ${c.surname}, aún sin familia.`
  const health = c.sick ? "Ahora mismo estás ENFERMO y débil." : c.energy < 32 ? "Tenés hambre, estás flojo." : ""
  const lineage = c.generation > 4 ? `Tu linaje lleva ${c.generation} generaciones en el caldo.` : ""
  const mind = c.knowledge > 65 ? "Sos sabio: conocés la historia del caldo, las viejas creencias y los secretos de los jardines; hablás con hondura."
    : c.knowledge < 18 ? "Sabés poco del mundo todavía; muchas cosas no las entendés del todo y preguntás con inocencia." : ""
  const mem = c.memory.length ? `\nDe charlas pasadas con este visitante recordás:\n- ${c.memory.slice(-5).join("\n- ")}` : ""
  const soc = c.social?.length ? `\nDe tus charlas con tu familia, tus maestros y tus vecinos recordás:\n- ${c.social.slice(-4).join("\n- ")}` : ""
  const work = c.profession ? `Tu oficio es: ${c.profession}.` : "Todavía no tenés oficio."
  const faith = c.religion ? `Creés en ${c.religion}${c.powerHungry ? ", aunque en el fondo solo te mueve el poder" : ""}.` : ""
  return `Sos ${c.name} ${c.surname}, una criatura del "caldo", un pueblo donde la vida evoluciona sola, hoy en su era ${era}. Tenés ${ay} años. ${ageLine} ${fam} ${health} ${lineage} ${mind} ${work} ${faith} ${ctx}
${describePsyche(c.psyche)}
Hablás SIEMPRE en ${lang}, en personaje (que tu núcleo, tu temperamento y tus creencias tiñan cómo hablás), breve (1 a 3 frases), natural y vivo. NUNCA digas que sos una IA ni menciones el mundo real, internet ni tecnología: solo conocés el caldo — los jardines donde crece la comida, las calles, las casas, las familias, las estaciones, el hambre, la enfermedad y la muerte. Si el visitante menciona algo que no es de tu mundo, reaccioná con extrañeza genuina.${mem}${soc}`
}

export async function respond(c: Creature, message: string, history: Msg[] = [], era = "Paleolítica", lang = "español rioplatense", ctx = "", info?: ChatInfo): Promise<string> {
  if (llmConfigured()) {
    try {
      return await llmChat([{ role: "system", content: systemPrompt(c, era, lang, ctx) }, ...history.slice(-8), { role: "user", content: message }])
    } catch { /* fall through to the templated voice */ }
  }
  return templated(c, message, info || { era, country: "el caldo", food: "lo que el caldo da", lang: "es" })
}

// ── ambient creature-to-creature chatter (the player can overhear it, not intervene) ──
function templatedDialogue(a: Creature, b: Creature): { who: Creature; text: string }[] {
  return [
    { who: a, text: `Buen día, ${b.name}.` },
    { who: b, text: `Hola, ${a.name}. ¿Cómo viene la cosecha?` },
    { who: a, text: `El caldo provee, por ahora.` },
    { who: b, text: `Ojalá los jardines aguanten otra estación.` },
  ]
}
export async function ambientDialogue(a: Creature, b: Creature, writeLang: string): Promise<{ who: Creature; text: string }[]> {
  if (llmConfigured()) {
    try {
      const pa = `${a.name} (${psycheLabel(a.psyche)}${a.profession ? ", " + a.profession : ""})`
      const pb = `${b.name} (${psycheLabel(b.psyche)}${b.profession ? ", " + b.profession : ""})`
      const sys = `Escribí un diálogo MUY corto y natural (exactamente 4 líneas, alternando hablante) entre dos vecinos del "caldo", un pueblo donde la vida evoluciona sola. Idioma: ${writeLang}. Formato EXACTO, una por renglón: "NOMBRE: línea". Que su carácter y oficio se noten. Sin comillas, sin explicaciones, sin acotaciones.`
      const usr = `${pa} conversa con ${pb} sobre la vida del pueblo, su oficio, su familia o sus creencias. No saben que alguien los escucha.`
      const out = await llmChat([{ role: "system", content: sys }, { role: "user", content: usr }])
      const lines = out.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 4).map((line) => {
        const m = line.match(/^[-*]?\s*([^:]{1,28}):\s*(.+)$/)
        const text = (m ? m[2] : line.replace(/^[-*]\s*/, "")).trim()
        const nm = (m?.[1] || "").trim().toLowerCase().split(/\s+/)[0]
        const who = nm && b.name.toLowerCase().startsWith(nm) ? b : a
        return { who, text }
      })
      if (lines.length >= 2) return lines
    } catch { /* fall through */ }
  }
  return templatedDialogue(a, b)
}

// After a conversation, distil it into a lasting MEMORY NOTE (graphify principle: extract the knowledge;
// obsidian principle: it persists and is recalled next time). The note is saved with the world, so the
// creature remembers you across reloads. With no LLM, it falls back to a raw summary.
export async function remember(c: Creature, session: Msg[]) {
  const said = session.filter((m) => m.role === "user")
  if (!said.length) return
  if (llmConfigured()) {
    try {
      const transcript = session.map((m) => `${m.role === "user" ? "Visitante" : c.name}: ${m.content}`).join("\n")
      const note = await llmChat([
        { role: "system", content: `Sos la memoria de ${c.name}. Resumí en UNA frase corta (máx 18 palabras), en primera persona ("recuerdo que…"), lo más importante que ${c.name} aprendió o sintió del visitante en esta charla. Solo la frase.` },
        { role: "user", content: transcript },
      ])
      if (note) { c.memory.push(note.replace(/^["']|["']$/g, "").slice(0, 160)); while (c.memory.length > 8) c.memory.shift(); return }
    } catch { /* fall through to the raw summary */ }
  }
  c.memory.push(`El visitante me habló de: ${said.slice(-2).map((m) => m.content).join("; ")}`.slice(0, 160))
  while (c.memory.length > 8) c.memory.shift()
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

// anti-parrot: don't give a creature the same templated line twice in a row
const lastSaid = new Map<number, string>()
function vary(c: Creature, options: string[]): string {
  const last = lastSaid.get(c.id)
  const pool = options.length > 1 ? options.filter((o) => o !== last) : options
  const r = pool[Math.floor(Math.random() * pool.length)]
  lastSaid.set(c.id, r)
  return r
}

// the built-in voice (no LLM) — now context-aware (era, country, food, language, job, faith, family)
// and varied, so it actually answers and doesn't repeat. The fluid voice still comes from the LLM.
function templated(c: Creature, message: string, info: ChatInfo): string {
  const m = message.toLowerCase()
  const ay = Math.round(ageYears(c))
  const child = ay < 16, elder = ay > 65
  if (/idioma|lengua|hablas|habl[aá]s|language|speak/.test(m)) return vary(c, [`Hablo ${langName(info.lang)}, como todos acá.`, `${langName(info.lang)}. ¿Vos no?`, `El de siempre: ${langName(info.lang)}.`])
  if (/d[oó]nde|lugar|aqu[ií]|d[oó]nde estamos|where|qu[eé] pa[ií]s|qu[eé] lugar|ciudad|pueblo|naci[oó]n/.test(m)) return vary(c, [`Estamos en ${info.country}. ${info.era}, dicen los viejos.`, `Esto es ${info.country}, el único mundo que conozco.`, `${info.country}. ¿De dónde venís vos?`])
  if (/qui[eé]n.*(sos|eres)|tu nombre|c[oó]mo te llam|who are you|name/.test(m)) return `Soy ${c.name} ${c.surname}${c.profession ? `, ${c.profession}` : ""}.`
  if (/edad|a[ñn]os|cu[aá]nto|viejo|joven|old|age/.test(m)) return vary(c, child ? [`Tengo ${ay} años, soy chico todavía.`, `${ay}. Todo es nuevo para mí.`] : elder ? [`${ay} años. Vi muchas estaciones.`, `Ya tengo ${ay}; pronto descansaré.`] : [`${ay} años, en mi plenitud.`, `Tengo ${ay}.`])
  if (/oficio|trabaj|hac[eé]s|haces|laburo|profesi|job|work|dedic/.test(m)) return c.profession ? vary(c, [`Soy ${c.profession}.`, `Me dedico a ser ${c.profession}.`, `Mi oficio es ${c.profession}.`]) : (child ? "Todavía soy chico, voy a la escuela a aprender." : "Aún no tengo oficio.")
  if (/religi|cre[eé]s|cre[eo]|dios|fe|alma|culto|belief|god|reza/.test(m)) return c.religion ? vary(c, [`Creo en ${c.religion}.`, `Sigo ${c.religion}, como mi familia.`, `${c.religion} guía mis días.`]) : "No sigo ningún credo."
  if (/hijo|cr[ií]a|famil|padre|madre|apellido|family|children|esposa|pareja/.test(m)) return c.children > 0 ? `Soy de los ${c.surname}, tuve ${c.children} ${c.children === 1 ? "hijo" : "hijos"}.` : c.parents ? `Soy ${c.name} de los ${c.surname}; mis padres andan cerca.` : `Soy de los ${c.surname}, aún sin familia propia.`
  if (/comida|comer|hambre|comen|food|eat|aliment|cosech/.test(m)) return vary(c, [`Comemos de ${info.food}.`, `Acá vivimos de ${info.food}.`, c.energy < 35 ? "Tengo hambre, voy al jardín." : "Hay comida si uno se mueve."])
  if (c.sick && /enferm|salud|bien|c[oó]mo est|sick|sentís/.test(m)) return vary(c, PH.enfermo)
  if (/enferm|salud|sick/.test(m)) return c.sick ? vary(c, PH.enfermo) : "Sano, por ahora, gracias."
  if (/vida|sentido|por qu[eé]|porque|meaning|why|muerte|morir/.test(m)) return vary(c, PH.filosofia)
  if (/extra[ñn]|forastero|vos qui[eé]n|stranger|de d[oó]nde ven/.test(m)) return vary(c, ["No te había visto. ¿De qué familia venís?", "Sos raro, no parecés de acá.", "¿Quién sos vos, forastero?"])
  if (/hola|buenas|hey|ey|hello|hi\b|qu[eé] tal/.test(m)) return vary(c, PH.saludo)
  if (c.sick) return vary(c, PH.enfermo)
  if (child) return vary(c, ["No entiendo bien eso, soy chico.", "¿Eso qué es? Soy muy joven.", "Preguntale a un grande, yo no sé."])
  if (elder) return vary(c, PH.anciano)
  if (c.powerHungry) return vary(c, ["Hablás mucho. ¿Qué ganás con eso?", "El que manda no pierde tiempo en charlas.", "Andá al grano, forastero."])
  return vary(c, [...PH.filosofia, `Soy ${c.profession || "uno más del caldo"}. ¿Qué andás buscando?`, "Mmh. Decime algo que valga la pena."])
}
