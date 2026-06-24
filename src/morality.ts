// morality.ts — the Seven Laws of Noah, the baseline moral + legal code of a caldo civilisation.
// They define what counts as a CRIME (for courts/justice) and, weighted by each person's conscience,
// how much inner restraint they feel before breaking one. A psychopath feels almost none.

import { Person } from "./population"

const cl = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

export interface NoahideLaw {
  key: string
  name: string
  kind: "deber" | "prohibición"
  desc: string
  severity: number     // 0..1 — how grave the violation (drives court punishment)
  simAct?: string      // the in-sim act that breaks it, when there is one
}

export const NOAHIDE: NoahideLaw[] = [
  { key: "justicia",   name: "Establecer tribunales de justicia", kind: "deber",       desc: "un sistema legal justo e imparcial que hace cumplir el resto", severity: 0 },
  { key: "blasfemia",  name: "No blasfemar",                      kind: "prohibición", desc: "no maldecir ni profanar lo sagrado",                          severity: 0.30, simAct: "blasfemar" },
  { key: "idolatria",  name: "No adorar ídolos",                  kind: "prohibición", desc: "no rendir culto a falsos dioses o imágenes",                  severity: 0.30, simAct: "idolatrar" },
  { key: "asesinato",  name: "No asesinar",                       kind: "prohibición", desc: "toda vida humana es sagrada",                                 severity: 1.00, simAct: "matar" },
  { key: "inmoralidad",name: "No cometer inmoralidad sexual",     kind: "prohibición", desc: "no incesto, adulterio ni relaciones ilícitas",               severity: 0.70, simAct: "adulterio" },
  { key: "robo",       name: "No robar",                          kind: "prohibición", desc: "no apropiarse de los bienes o el trabajo ajeno",              severity: 0.50, simAct: "robar" },
  { key: "crueldad",   name: "No comer carne de un animal vivo",  kind: "prohibición", desc: "no crueldad: no arrancar carne de un animal con vida",        severity: 0.40, simAct: "crueldad" },
]

export const lawFor = (simAct: string) => NOAHIDE.find((l) => l.simAct === simAct)

// CONSCIENCE — how strongly a person internalises the moral code. Prosocial traits (agreeableness +
// conscientiousness) build it; dark-triad traits erode it (psychopathy most). 0 = no restraint at all.
export function conscience(p: Person): number {
  const prosocial = (p.five.a + p.five.c) / 2
  const dark = p.dark.psycho * 0.6 + p.dark.mach * 0.3 + p.dark.narc * 0.2
  return cl(prosocial - dark)
}

// felt RESTRAINT against breaking a specific law = conscience scaled by how grave that law is.
export function restraint(p: Person, lawKey: string): number {
  const law = NOAHIDE.find((l) => l.key === lawKey)
  return law ? conscience(p) * (0.4 + 0.6 * law.severity) : 0
}
