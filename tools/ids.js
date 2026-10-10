// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Natura Naturans
// Identifier forms of the corpus: the Latin key ("1p6c1", "2physax3", "3aff6", "3gda", "4app5", "note24")
// and the Russian identifier shown to the reader ("Э1т6кор1", "Э2аксф3", "Э3афф6", "Э3ооа", "Э4приб5", "Прим24").
// Mirrors RU2EN in src/ethics/EthicaIndex.js (toLatin) in the other direction.
const EN2RU = [
  ["physax", "аксф"], ["physdef", "опрф"], ["app", "приб"], ["pref", "пред"], ["post", "пост"], ["aff", "афф"], ["gda", "ооа"],
  ["dem", "док"], ["lem", "лем"], ["exp", "об"], ["d", "опр"], ["a", "акс"], ["c", "кор"], ["s", "сх"], ["p", "т"],
]

/** "1p6c1" -> "Э1т6кор1", "note24" -> "Прим24" */
export function toRid(id) {
  const n = /^note(\d+)$/.exec(id)
  if (n) return `Прим${n[1]}`
  const m = /^(\d)(.*)$/.exec(id)
  if (!m) throw new Error(`not a corpus id: ${id}`)
  let rest = m[2], out = ""
  while (rest.length > 0) {
    const d = /^\d+/.exec(rest)
    if (d) { out += d[0]; rest = rest.slice(d[0].length); continue }
    const pair = EN2RU.find(([en]) => rest.startsWith(en))
    if (!pair) throw new Error(`cannot name ${id}`)
    out += pair[1]; rest = rest.slice(pair[0].length)
  }
  return `Э${m[1]}${out}`
}

const ROMAN = ["", "I", "II", "III", "IV", "V"]
const CAP = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Часть I · Теорема 6 · Королларий 1" - the chain of an entry and its parents (entries keyed by id). */
export function describe(entry, byId) {
  const chain = []
  for (let e = entry; e; e = e.parent ? byId[e.parent] : null) chain.unshift(e)
  const parts = chain.map((e) => {
    if (e.label) return e.label
    if (e.type === "прибавление (глава)") return `Прибавление · Глава ${e.number}`
    return `${CAP(e.type)}${e.number ? ` ${e.number}` : ""}`
  })
  return entry.part ? `Часть ${ROMAN[entry.part]} · ${parts.join(" · ")}` : parts.join(" · ")
}
