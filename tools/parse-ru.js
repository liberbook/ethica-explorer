// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Natura Naturans
// Parses the Russian text of the Ethics (N. A. Ivantsov's translation, one paragraph per line,
// "## " marks a heading) into entries with stable ids:
// 1d1, 1d6exp, 1a1, 1p7, 1p7dem, 1p11dem2, 1p8s2, 1p14c1, 2lem3, 2lem3c1, 2physax1..5, 2physdef,
// 2post1, 3aff1, 3aff1exp, 3gda, 3gdaexp, 1app, 4app1..32, 2pref.
// Pure text -> structure; reference annotation is annotate.js.
import fs from "node:fs"

const PARTS = {первая: 1, вторая: 2, третья: 3, четвертая: 4, пятая: 5}
const ROMAN = {I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10}
export const TYPE_RU = {
  d: "определение", dexp: "объяснение", a: "аксиома", post: "постулат", p: "теорема", dem: "доказательство",
  c: "королларий", s: "схолия", lem: "лемма", physax: "аксиома (о телах)", physdef: "определение (о телах)",
  aff: "определение аффекта", affexp: "объяснение", gda: "общее определение аффектов", gdaexp: "объяснение",
  pref: "предисловие", app: "прибавление", cap: "прибавление (глава)", note: "примечание",
}

function roman(s) {
  let n = 0
  const v = {I: 1, V: 5, X: 10, L: 50, C: 100}
  for (let i = 0; i < s.length; i++) n += i + 1 < s.length && v[s[i + 1]] > v[s[i]] ? -v[s[i]] : v[s[i]]
  return n
}

/** @returns {Array<{id, part, type, number, parent, text, label?}>} in reading order */
export function parseRussian(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const entries = []
  let part = 0, section = null, cur = null, theorem = null, lemma = null, physAx = 0
  const counters = {}
  const count = (key) => (counters[key] = (counters[key] ?? 0) + 1)
  const open = (id, type, number, parent, first = "") => {
    cur = {id, part, type, number, parent, text: first.trim()}
    entries.push(cur)
    return cur
  }
  const append = (l) => {
    if (!cur) throw new Error(`text before any entry: ${l.slice(0, 60)}`)
    cur.text = cur.text ? `${cur.text}\n${l}` : l
  }
  for (const l of lines) {
    let m
    if ((m = /^## Часть (\S+)$/.exec(l))) { part = PARTS[m[1]]; section = "title"; cur = null; theorem = lemma = null; continue }
    if (l === "## Предисловие") { section = "pref"; open(`${part}pref`, "pref", null, null); continue }
    if (l === "## Определения") { section = "def"; cur = null; continue }
    if (l === "## Аксиомы") { section = "ax"; cur = null; continue }
    if (l === "## Аксиома") { section = "ax1"; open(`${part}a1`, "a", 1, null); continue }
    if (l === "## Постулаты") { section = "post"; cur = null; continue }
    if (l === "## Определение аффектов") { section = "aff"; cur = null; continue }
    if (l === "## Общее определение аффектов") { section = "gda"; open("3gda", "gda", null, null); continue }
    if (l === "## Примечания") { section = "notes"; part = 0; cur = null; continue }
    if (l === "## Прибавление") { section = "app"; open(`${part}app`, "app", null, null); continue }
    if (l.startsWith("## ")) throw new Error(`unknown heading: ${l}`)
    if (section === "title") { continue } // the part's subtitle ("О Боге")
    if ((m = /^Теорема (\d+)\.?$/.exec(l))) {
      section = "prop"; theorem = `${part}p${m[1]}`; lemma = null
      open(theorem, "p", Number(m[1]), null); continue
    }
    if ((m = /^Лемма (\d+)$/.exec(l))) {
      section = "lem"; lemma = `${part}lem${m[1]}`; theorem = null
      open(lemma, "lem", Number(m[1]), null); continue
    }
    if (section === "prop" || section === "lem" || section === "phys") {
      const host = section === "lem" ? lemma : theorem
      if ((m = /^Аксиома (\d+)$/.exec(l))) { section = "phys"; physAx += 1; open(`2physax${physAx}`, "physax", Number(m[1]), null); cur.label = physAx <= 2 ? `Аксиома ${m[1]} (после сх. т. 13)` : physAx <= 4 ? `Аксиома ${m[1]} (после леммы 3)` : `Аксиома ${m[1]} (после определения)`; continue }
      if (l === "Определение") { section = "phys"; open("2physdef", "physdef", null, null); cur.label = "Определение (после леммы 3)"; continue }
      if (section === "phys" && !/^(Аксиома|Лемма|Определение)/.test(l)) { append(l); continue }
      if ((m = /^Доказательство(?: (\d+))?\.\s*(.*)$/.exec(l)) || (m = /^Доказательство (этой (?:теоремы|леммы) .*)$/.exec(l) && [l, null, l])) {
        const n = count(`${host}dem`)
        const afterCorollary = cur && cur.parent === host && /c\d+$/.test(cur.id) ? cur.id : null
        open(`${host}dem${n > 1 ? n : ""}`, "dem", m[1] ? Number(m[1]) : null, host, m[2])
        if (afterCorollary) cur.of = afterCorollary // the demonstration of that corollary, kept under the theorem as the 1677 text prints it
        continue
      }
      if ((m = /^Королларий(?: (\d+))?\.\s*(.*)$/.exec(l))) {
        const n = m[1] ? Number(m[1]) : count(`${host}c`)
        if (!m[1]) counters[`${host}c`] = n
        open(`${host}c${n}`, "c", n, host, m[2]); continue
      }
      if ((m = /^Схолия(?: (\d+))?\.\s*(.*)$/.exec(l))) {
        const n = m[1] ? Number(m[1]) : count(`${host}s`)
        open(`${host}s${n}`, "s", n, host, m[2]); continue
      }
      append(l); continue
    }
    if (section === "def" || section === "ax" || section === "post" || section === "aff") {
      const kind = {def: "d", ax: "a", post: "post", aff: "aff"}[section]
      if ((m = /^(\d+)\.\s+(.*)$/.exec(l))) { open(`${part}${kind}${m[1]}`, kind, Number(m[1]), null, m[2]); continue }
      if ((m = /^Объяснение\.\s*(.*)$/.exec(l))) { open(`${cur.id}exp`, `${kind}exp`, null, cur.id, m[1]); continue }
      // the edition prints two passages without their own heading: definition 8 of part IV and the
      // explanation of definition 3 of part III (an "Explicatio" in the Latin)
      if (cur.id === "4d7" && l.startsWith("Под добродетелью")) { open("4d8", "d", 8, null, l); continue }
      if (cur.id === "3d3" && l.startsWith("Если, таким образом")) { open("3d3exp", "dexp", null, "3d3", l); continue }
      append(l); continue
    }
    if (section === "gda") {
      if ((m = /^Объяснение\.\s*(.*)$/.exec(l))) { open("3gdaexp", "gdaexp", null, "3gda", m[1]); continue }
      append(l); continue
    }
    if (section === "app") {
      if ((m = /^Гл\. ([IVXL]+)\.\s*(.*)$/.exec(l))) { open(`${part}app${roman(m[1])}`, "cap", roman(m[1]), null, m[2]); continue }
      append(l); continue
    }
    if (section === "notes") {
      if ((m = /^(\d+)\.\s+(.*)$/.exec(l))) { open(`note${m[1]}`, "note", Number(m[1]), null, m[2]); continue }
      append(l); continue
    }
    if (section === "pref" || section === "ax1") { append(l); continue }
    throw new Error(`unplaced line in section ${section}: ${l.slice(0, 80)}`)
  }
  for (const e of entries) e.type = TYPE_RU[e.type] ?? e.type
  return entries
}

if (process.argv[1] && process.argv[1].endsWith("parse-ru.js")) {
  const entries = parseRussian(fs.readFileSync(process.argv[2] ?? new URL("../source/ethica_ru_ivantsov.txt", import.meta.url), "utf8"))
  console.log(JSON.stringify(entries, null, 1))
}
