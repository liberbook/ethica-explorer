// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Natura Naturans
// Recognises the cross-references Spinoza writes in his demonstrations ("по т. 7", "кор. т. 25, ч. I",
// "сх. 2 т. 40", "пред. т.", "ее кор.", "6 опр. аффектов", "в Прибавлении к первой части" ...) and
// writes the identifier of the passage after each of them: "по т. 7 [Э1т7]". The identifiers are the
// ones shown to the reader: Э1т7, Э1т6кор1, Э2т40сх2, Э3афф6, Э3ооа.
//
// annotate(entries) -> {entries, issues}: every entry gets `text` with the identifiers inserted and
// `refs` (the identifiers in order of appearance); `issues` lists what could not be resolved.
import {toRid} from "./ids.js"

const ROMAN = {I: 1, II: 2, III: 3, IV: 4, V: 5, Ill: 3, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5}
const ORDINAL_PART = {первой: 1, второй: 2, третьей: 3, четвертой: 4, пятой: 5}
const NUM = String.raw`\d+`
// "16", "21 и 22", "53; 54; 55", "1, 2 и 3"
const LIST = String.raw`(\d+(?:\s*(?:,|;|и|или|&)\s*\d+)*)`
const SP = String.raw`[\s,]*`
// where the part of a reference is named: ", ч. I" after it, "этой части", or "ч. I, т. 25" before it
const PART_AFTER = new RegExp(String.raw`^[,;.]?\s*(?:ч[.,]\s*(I{1,3}|IV|V|Ill|[1-5])\b|(этой)\s+(?:части|ч\.))`)
const PART_BEFORE = new RegExp(String.raw`ч\.\s*(I{1,3}|IV|V)\s*,?\s*$`)

const nums = (s) => s.match(/\d+/g).map(Number)

/**
 * The reference patterns. Each matches at the START of the remaining text; `make(m, ctx)` returns
 * the ids ("1p7", "1p6c1") or a string naming the problem (starting with "?").
 * Order matters: the more specific forms come first.
 */
const PATTERNS = [
  // general definition of the affects
  {re: /^общ(?:\.|ее|ему|его|им)\s*опр(?:\.|ед\.|еделени[еяю])\s*аффектов/i, make: () => ["3gda"]},
  // "Аксиома четвертой части" (part IV has one axiom)
  {re: /^[Аа]ксиом[аеуы]\s+(первой|второй|третьей|четвертой|пятой)\s+части/, make: (m) => [`${ORDINAL_PART[m[1]]}a1`]},
  // "кор. той же т." - the corollary of the theorem just named
  {re: /^кор\.\s*(?:той|этой)\s*же\s*т\./, make: (m, c) => [c.last.p ? `${c.last.p}c1` : "?кор. той же т."]},
  // "объясн. 4 опр. аффектов" / "6 опр. аффектов" / "21 и 22 опр. аффектов" / "1 опред. аффектов"
  {re: new RegExp(String.raw`^(объясн\.\s*)?${LIST}\s*опр(?:\.|ед\.)\s*аффектов`), make: (m) => nums(m[2]).map((n) => `3aff${n}${m[1] ? "exp" : ""}`)},
  // "опр. 6 аффектов" / "опр. 6 и 7 аффектов" / "определению 6 аффектов"
  {re: new RegExp(String.raw`^опр(?:\.|ед\.|еделени[еяю])\s*${LIST}\s*аффектов`), make: (m) => nums(m[1]).map((n) => `3aff${n}`)},
  // "в Прибавлении к первой части" / "в прибавлении к этой части"
  {re: /^Прибавлени[ияе]\s+к\s+(первой|второй|третьей|четвертой|пятой|этой)\s+части/i, make: (m, c) => [`${m[1] === "этой" ? c.part : ORDINAL_PART[m[1]]}app`]},
  // "предисловии к третьей части" / "предисловия этой части" / "конец предисловия"
  {re: /^предислови[иея](?:\s+к\s+(первой|второй|третьей|четвертой|пятой|этой)\s+части|\s+этой\s+части)?/i, make: (m, c) => [`${m[1] && m[1] !== "этой" ? ORDINAL_PART[m[1]] : c.part}pref`]},
  // corollary of the previous theorem: "кор. пред. т." / "кор. 1 пред. т." / "кор. 2 предыдущей теоремы"
  {re: /^(?:кор\.|короллари[йяию])\s*(\d+)?\s*пред(?:[.,]|ыдущей)\s*(?:т\.|теоремы)/, make: (m, c) => [`${prevTheorem(c, `c${m[1] ?? 1}`)}c${m[1] ?? 1}`]},
  {re: /^(первый|второй|третий)\s+королларий\s+пред(?:[.,]|ыдущей)\s*(?:т\.|теоремы)/, make: (m, c) => { const n = {первый: 1, второй: 2, третий: 3}[m[1]]; return [`${prevTheorem(c, `c${n}`)}c${n}`] }},
  // scholium of the previous theorem
  {re: /^сх\.\s*(\d+)?\s*пред(?:[.,]|ыдущей)\s*(?:т\.|теоремы)/, make: (m, c) => [`${prevTheorem(c)}s${m[1] ?? 1}`]},
  {re: /^пред(?:[.,]|ыдущ\w+)\s*(?:кор\.|королларий|короллария)/, make: (m, c) => [prevOf(c, "c")]},
  {re: /^пред(?:[.,]|ыдущ\w+)\s*(?:сх\.|схоли[июяе])/, make: (m, c) => [prevOf(c, "s")]},
  {re: /^пред(?:[.,]|ыдущ\w+)\s*(?:лем\.|лемм[аеуы])/, make: (m, c) => [prevOf(c, "lem")]},
  {re: /^пред(?:[.,]|ыдущ\w+)\s*(?:опр\.|определени[еяю])/, make: (m, c) => [prevOf(c, "d")]},
  // "пред. т." / "предыдущей теореме" / "предыдущая" (as in "доказывается тем же путем, как и предыдущая;")
  {re: /^пред(?:[.,]|ыдущ(?:ей|ую|ая))\s*(?:т\.|теорем[аеуы](?!\w))/, make: (m, c) => [prevTheorem(c)]},
  {re: /^предыдущ(?:ая|ей)(?=[\s;.,)])/, make: (m, c) => [prevTheorem(c)]},
  // "той же сх. т. 11" / "тому же кор. т. 11" name the theorem again
  {re: new RegExp(String.raw`^(?:той|этой)\s*же\s*сх\.\s*т\.\s*(\d+)`), make: (m, c) => [`${c.part}p${m[1]}s1`], partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  {re: new RegExp(String.raw`^(?:тому|том)\s*же\s*кор\.\s*т\.\s*(\d+)`), make: (m, c) => [`${c.part}p${m[1]}c1`], partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  {re: /^следующ\w+\s+(?:кор\.|короллари[йя])/, make: (m, c) => [`${c.host}c1`]},
  {re: new RegExp(String.raw`^(?:той|этой)\s*же\s*т\.\s*(\d+)`), make: (m, c) => [`${c.part}p${m[1]}`], partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  // "той же т." / "этой т." / "той же теоремы" -> the theorem last named, else the host
  {re: /^(?:той|этой|эту|ту)\s*(?:же\s*)?(?:т\.|теорем[аеуы])/, make: (m, c) => [c.last.p ?? c.host]},
  {re: /^(?:той|тому|том|этой|этом)\s*же\s*(?:сх\.|схоли[июяе])/, make: (m, c) => [c.last.s ?? `?той же сх.`]},
  {re: /^(?:тому|том|этому|указанному)\s*(?:же\s*)?(?:кор\.|короллари[йяю])/, make: (m, c) => [c.last.c ?? `?тому же кор.`]},
  {re: /^(?:той|этой)\s*же\s*(?:акс\.|аксиом[аеы])/, make: (m, c) => [c.last.a ?? `?той же акс.`]},
  {re: /^(?:тому|том)\s*же\s*(?:пост\.|постулат[уе])/, make: (m, c) => [c.last.post ?? `?тому же пост.`]},
  {re: /^(?:той|этой)\s*же\s*(?:лем\.|лемм[еы])/, make: (m, c) => [c.last.lem ?? `?той же лем.`]},
  {re: /^(?:тому|том|этому)\s*же\s*(?:опр\.|определени[юи])/, make: (m, c) => [c.last.d ?? `?тому же опр.`]},
  // "в схолии той же теоремы" / "в сх. той же т."
  {re: /^(?:сх\.|схолии)\s*(?:той|этой)\s*же\s*(?:т\.|теоремы)/, make: (m, c) => [`${c.last.p ?? c.host}s1`]},
  // "ее кор." / "ее 1-м кор." / "ее 2-й схолией" / "его кор." - of the theorem just named
  {re: /^(?:ее|его)\s*(\d+)?(?:-[мй])?\s*(?:кор\.|короллари[йяею])/, make: (m, c) => [c.last.p ? `${c.last.p}c${m[1] ?? 1}` : "?ее кор."]},
  {re: /^(?:ее|его)\s*(\d+)?(?:-[мй])?\s*(?:сх\.|схоли[июяе]й?)/, make: (m, c) => [c.last.p ? `${c.last.p}s${m[1] ?? 1}` : "?ее сх."]},
  // "кор. леммы 3" / "кор. после т. 13" -> corollary of that lemma / theorem
  {re: new RegExp(String.raw`^кор\.\s*(\d+)?\s*(?:лем\.|леммы)\s*(\d+)`), make: (m) => [`2lem${m[2]}c${m[1] ?? 1}`]},
  {re: new RegExp(String.raw`^кор\.\s*(\d+)?\s*после\s*т\.\s*(\d+)`), make: (m, c) => [`${c.part}p${m[2]}c${m[1] ?? 1}`]},
  // "кор. т. 25" / "кор. 2 т. 20" / "кор. 1 и 2 т. 32" / "кор. т. 7 и 11" / "кор., т. 9" / "кор. 2, т. 16"
  {re: new RegExp(String.raw`^(?:кор\.|короллари[йяию])\s*${LIST}?[\s,]*т\.\s*${LIST}`), make: (m, c) => {
    const cs = m[1] ? nums(m[1]) : [1], ps = nums(m[2])
    return ps.flatMap((p) => cs.map((k) => `${c.part}p${p}c${k}`))
  }, partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  // "сх. т. 13" / "сх. 2 т. 40" / "сх. 1 к т. 8" / "сх. т. 18 и 19"
  {re: new RegExp(String.raw`^сх\.\s*${LIST}?[\s,]*(?:к\s*)?т\.\s*${LIST}`), make: (m, c) => {
    const ss = m[1] ? nums(m[1]) : [1], ps = nums(m[2])
    return ps.flatMap((p) => ss.map((k) => `${c.part}p${p}s${k}`))
  }, partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  // "сх. 18" (scholium of theorem 18, as in "опр. памяти в сх. 18, ч. II")
  {re: new RegExp(String.raw`^сх\.\s*${NUM}(?=[,;]?\s*ч\.)`), make: (m, c) => [`${c.part}p${nums(m[0])[0]}s1`], partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  {re: new RegExp(String.raw`^т\.\s*${LIST}\s*опр\.\s*аффектов`), make: (m) => nums(m[1]).map((n) => `3aff${n}`)},
  // "т. 7" / "т. 21 и 22" / "т.т. 53; 54; 55" / "теорема 21" / "теоремы 30 и 31" / "вт. 16" (OCR)
  {re: new RegExp(String.raw`^(?:т\.\s*т\.|т\.|теорем(?:[аеуы]|ами|ах)?|вт\.)\s*${LIST}`), make: (m, c) => nums(m[1]).map((n) => `${c.part}p${n}`), partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  // "опр. 6" / "опр. 1 и 2" / "определений 3 и 5" / "определения 1"
  {re: new RegExp(String.raw`^(?:опр\.|опред\.|определени[еяйюи])\s*${LIST}(?!\s*(?:опр\.|аффектов))`), make: (m, c) => nums(m[1]).map((n) => `${c.part}d${n}`), partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  // "акс. 4" / "акс. 1 и 2" / "аксиомы 1"; "акс. 1 после леммы 3" / "акс. 2 после кор. леммы 3" -> the axioms about bodies
  {re: new RegExp(String.raw`^(?:акс\.|аксиом[аеыу])\s*${LIST}\s*(?:,\s*)?(?:которую\s*см\.\s*)?после\s*(?:кор\.\s*)?леммы\s*3`), make: (m) => nums(m[1]).map((n) => `2physax${n + 2}`)},
  {re: new RegExp(String.raw`^(?:акс\.|аксиом[аеыу])\s*${LIST}`), make: (m, c) => nums(m[1]).map((n) => physicalAxiom(c, n) ?? `${c.part}a${n}`), partOf: (ids, part) => ids.map((id) => (id.includes("physax") ? id : part + id.slice(1)))},
  // "акс. этой части" / "аксиомы этой части" (part IV has a single axiom)
  {re: /^(?:акс\.|аксиом[аеы])\s*(?:этой|настоящей)\s*(?:части|ч\.)/, make: (m, c) => [`${c.part}a1`]},
  // "лемма 3" / "по лемме 2" / "леммы 3" / "лем. 3"
  {re: new RegExp(String.raw`^(?:лем\.|лемм[аеыу])\s*${LIST}`), make: (m) => nums(m[1]).map((n) => `2lem${n}`)},
  // "пост. 5" / "пост. 3 и 6" / "постулату 1"
  {re: new RegExp(String.raw`^(?:пост\.|постулат[аеуы])\s*${LIST}`), make: (m, c) => nums(m[1]).map((n) => `${c.part}post${n}`), partOf: (ids, part) => ids.map((id) => part + id.slice(1))},
  // "опр., после кор. леммы 3" / "опр. после леммы 3" / "определения индивидуума, которое см. перед леммой 4"
  {re: /^опр\.[\s,]*после\s*(?:кор\.\s*)?леммы\s*3|^опр\.\s*перед\s*леммой\s*4|^определения\s+индивидуума/, make: () => ["2physdef"]},
]

/**
 * Inside the digression on bodies (after 2p13) "акс. 1" is an axiom about bodies: in lemmas 1-3 the two
 * axioms before lemma 1, in lemmas 4-7 the three after lemma 3. Elsewhere null.
 */
function physicalAxiom(c, n) {
  const m = /^2lem(\d+)/.exec(c.host)
  if (!m) return null
  return Number(m[1]) <= 3 ? `2physax${n}` : `2physax${n + 2}`
}

/**
 * "1p7" of the theorem before the host of the current entry. In a corollary (and its demonstration)
 * "the preceding theorem" is the host itself - unless that would name the corollary itself
 * ("как первый королларий предыдущей теоремы" in 3p41c1), then it is the theorem before the host.
 */
function prevTheorem(c, suffix = "") {
  const before = () => {
    const m = /^(\d)(p|lem)(\d+)$/.exec(c.host)
    return m ? `${m[1]}${m[2]}${Number(m[3]) - 1}` : "?пред. т."
  }
  if (c.entry.type === "королларий" || c.entry.of) return `${c.host}${suffix}` === c.entry.id ? before() : c.host
  return before()
}

/** The last entry of kind c/s/lem/d (id suffix) before the host in reading order; "пред. кор." in corollary n is n-1. */
function prevOf(c, kind) {
  if (kind === "c" && c.entry.type === "королларий" && c.entry.number > 1) return `${c.host}c${c.entry.number - 1}`
  const idx = c.order.indexOf(c.host)
  const re = kind === "lem" ? /^2lem\d+$/ : kind === "d" ? /^(\dd\d+|2physdef)$/ : new RegExp(`^\\d(?:p|lem)\\d+${kind}\\d+$`)
  for (let i = idx - 1; i >= 0; i--) if (re.test(c.order[i])) return c.order[i]
  return `?пред. ${kind}`
}

const kindOf = (id) => (/s\d+$/.test(id) ? "s" : /c\d+$/.test(id) ? "c" : /^\dp\d+$/.test(id) ? "p" : /^\da\d+$/.test(id) || /physax/.test(id) ? "a" : /post\d+$/.test(id) ? "post" : /^2lem\d+$/.test(id) ? "lem" : /^\dd\d+$/.test(id) || id === "2physdef" ? "d" : null)

/**
 * @param {Array<{id, part, type, number, parent, text, of?}>} entries in reading order
 * @returns {{entries: Array, issues: Array<{id, at, problem}>}}
 */
export function annotate(entries) {
  const ids = new Set(entries.map((e) => e.id))
  const order = entries.map((e) => e.id)
  const issues = []
  const out = entries.map((entry) => {
    const host = entry.parent ?? entry.id
    const c = {entry, host, part: entry.part, order, last: {}}
    const text = entry.text
    let pos = 0, result = "", refs = []
    while (pos < text.length) {
      const rest = text.slice(pos)
      let hit = null
      // a reference starts at a word boundary
      if (pos === 0 || /[\s(,;:«"'\-–—⟦]/.test(text[pos - 1])) {
        for (const p of PATTERNS) {
          const m = p.re.exec(rest)
          if (m) { hit = {m, p}; break }
        }
      }
      if (!hit) { result += text[pos]; pos += 1; continue }
      const {m, p} = hit
      let targets = p.make(m, c)
      // the part: ", ч. I" right after, "ч. I, " right before, or "этой части"
      if (p.partOf) {
        const after = PART_AFTER.exec(rest.slice(m[0].length))
        const before = PART_BEFORE.exec(result.slice(-12))
        let part = null
        if (after && after[1]) part = ROMAN[after[1]]
        else if (after && after[2]) part = c.part
        else if (before) part = ROMAN[before[1]]
        else part = partFromGroup(rest.slice(m[0].length), c.part)
        targets = p.partOf(targets, part)
      }
      const good = [], bad = []
      // "объясн. 12 и 13 опр. аффектов": definition 12 has no explanation of its own (13's covers both)
      targets = targets.map((t) => (t.endsWith("exp") && !ids.has(t) && ids.has(t.slice(0, -3)) ? t.slice(0, -3) : t))
      for (const t of targets) (t.startsWith("?") || !ids.has(t) ? bad : t === host || t === entry.id ? [] : good).push(t)
      for (const t of bad) issues.push({id: entry.id, at: text.slice(Math.max(0, pos - 30), pos + m[0].length + 20).replace(/\n/g, " "), problem: t.startsWith("?") ? `unresolved: ${t.slice(1)}` : `no such passage: ${t}`})
      result += m[0]
      pos += m[0].length
      if (good.length > 0) {
        result += ` [${good.map(toRid).join(", ")}]`
        refs.push(...good)
        for (const t of good) { const k = kindOf(t); if (k) c.last[k] = t; if (k === "c" || k === "s") c.last.p = t.replace(/[cs]\d+$/, "") }
      }
    }
    return {...entry, text: result, refs}
  })
  return {entries: out, issues}
}

/** A trailing part marker of a parenthesised group ("по т. 3 и опр. 2, ч. III") applies to every item in it. */
function partFromGroup(after, fallback) {
  const window = after.slice(0, 60)
  const stop = window.search(/[)]|\. (?![IV]+\b|Ill\b)[А-ЯA-Z]/)
  const scope = stop >= 0 ? window.slice(0, stop) : window
  const m = /(?:ч[.,]\s*(I{1,3}|IV|V|Ill|[1-5])\b|(этой)\s+(?:части|ч\.))/.exec(scope)
  if (!m) return fallback
  return m[1] ? ROMAN[m[1]] : fallback
}
