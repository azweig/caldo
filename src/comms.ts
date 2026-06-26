// comms.ts — when nobody is listening, aldeanos don't waste breath on full sentences: they chatter in a tiny
// CODE (a few bits each) that's near-free to exchange + store. So thousands of background conversations can
// happen per minute, spreading gossip, ideas, opinions, news + warnings through the whole town. When YOU
// tune in, the codes are DECODED back into words. Fast machine-talk under the hood; human talk when watched.

// a single compact message: kind (3 bits), subject (a creature/topic id), value (a small signed payload)
export interface Sig { k: number; s: number; v: number }
export const KIND = { GREET: 0, GOSSIP: 1, NEWS: 2, IDEA: 3, OPINION: 4, EMOTE: 5, OFFER: 6, WARN: 7 } as const
const KIND_NAME = ["saludo", "chisme", "noticia", "idea", "opinión", "sentir", "trato", "aviso"]

// pack a signal into a short binary string, e.g. "001·01010110·+4" — the "0s and 1s" you see flying overhead
export function codeOf(s: Sig): string {
  const v = Math.max(-7, Math.min(7, Math.round(s.v)))
  return `${s.k.toString(2).padStart(3, "0")}${(Math.abs(s.s) & 31).toString(2).padStart(5, "0")}${v >= 0 ? "+" : "-"}${Math.abs(v)}`
}

// decode a signal into a human line (for when the player overhears a conversation)
export function decode(s: Sig, subjName: string): string {
  const pos = s.v >= 0
  switch (s.k) {
    case KIND.GREET: return pos ? "¡qué gusto verte!" : "andábamos cruzados…"
    case KIND.GOSSIP: return pos ? `dicen que ${subjName} es de fiar` : `cuidado con ${subjName}, dicen cosas`
    case KIND.NEWS: return pos ? `¿oíste? ${subjName} tuvo buena fortuna` : `mala nueva sobre ${subjName}`
    case KIND.IDEA: return `tengo una idea para mejorar el oficio`
    case KIND.OPINION: return pos ? `yo creo que está bien` : `yo no lo veo así`
    case KIND.EMOTE: return pos ? "hoy ando contento" : "ando con el ánimo bajo"
    case KIND.OFFER: return pos ? "te puedo dar una mano" : "ando necesitando ayuda"
    case KIND.WARN: return `¡ojo con ${subjName}!`
    default: return "…"
  }
}
export const kindName = (k: number) => KIND_NAME[k] || "?"
