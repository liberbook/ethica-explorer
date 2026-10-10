// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Natura Naturans
// The cross-references of the Latin text ("per Prop. 7 hujus", "Coroll. 2 Prop. 20 p. I",
// "per 6 et 7 Affect. Defin.", "Axiom. 1 post Lem. 3") as corpus ids, reduced to the cited passage's
// top level (2p40s2 -> 2p40). Used only to cross-check the Russian annotation, so it errs on the side
// of recall; implicit references ("per Prop. praeced.") are not resolved here.
const ROMAN = {I: 1, II: 2, III: 3, IV: 4, V: 5}
const NUMLIST = String.raw`(\d+(?:\s*(?:,|et|&|vel)\s*\d+)*)`
const PART = /\b(?:p\.\s*(I{1,3}|IV|V)\b|[Pp]artis\s+(I{1,3}|IV|V)\b|(hujus))/
const nums = (s) => s.match(/\d+/g) ?? []

const PATTERNS = [
  [String.raw`Coroll(?:\.|ari\w*)\s*(\d+)?\s*Prop(?:\.|osition\w*)\s*${NUMLIST}`, (g, p) => nums(g[2]).map((n) => `${p}p${n}`)],
  [String.raw`Schol(?:\.|i\w*)\s*(\d+)?\s*Prop(?:\.|osition\w*)\s*${NUMLIST}`, (g, p) => nums(g[2]).map((n) => `${p}p${n}`)],
  [String.raw`Ax(?:\.|iom\w*\.?)\s*${NUMLIST}\s*(?:,\s*quod\s*est\s*)?post\s*(?:Coroll\.\s*)?Lem\w*\.?\s*3`, (g) => nums(g[1]).map((n) => `2physax${Number(n) + 2}`)],
  [String.raw`Defin\w*\.?\s*post\s*(?:Coroll\.\s*)?Lem\w*`, () => ["2physdef"]],
  [String.raw`Lemm\w*\s*${NUMLIST}`, (g) => nums(g[1]).map((n) => `2lem${n}`)],
  [String.raw`(?:gen\w*\.?\s*(?:Affect\w*\.?\s*)?Defin\w*|Affect\w*\.?\s*gen\w*\.?\s*Defin\w*)`, () => ["3gda"]],
  [String.raw`${NUMLIST}\s*(?:Affect\w*\.?|Aff\.)\s*Def\w*\.?`, (g) => nums(g[1]).map((n) => `3aff${n}`)],
  [String.raw`Defin\w*\.?\s*${NUMLIST}\s*(?:Affect\w*\.?|Aff\.)`, (g) => nums(g[1]).map((n) => `3aff${n}`)],
  [String.raw`Defin\w*\.?\s*${NUMLIST}`, (g, p) => nums(g[1]).map((n) => `${p}d${n}`)],
  [String.raw`Ax(?:\.|iom\w*\.?)\s*${NUMLIST}`, (g, p) => nums(g[1]).map((n) => `${p}a${n}`)],
  [String.raw`Postul\w*\.?\s*${NUMLIST}`, (g, p) => nums(g[1]).map((n) => `${p}post${n}`)],
  [String.raw`Prop(?:\.|osition\w*)\s*${NUMLIST}`, (g, p) => nums(g[1]).map((n) => `${p}p${n}`)],
].map(([re, make]) => [new RegExp(re, "g"), make])

/** @returns {string[]} top-level ids cited by one Latin segment of part `part` */
export function latinRefs(text, part) {
  const out = []
  // parenthesised groups first, then the bare sentences around them
  const groups = [...text.matchAll(/\(([^()]*)\)/g)].map((m) => m[1])
  groups.push(...text.replace(/\([^()]*\)/g, " | ").split(/[|;]/))
  for (const g of groups) {
    const used = new Array(g.length).fill(false)
    for (const [re, make] of PATTERNS) {
      re.lastIndex = 0
      for (const m of g.matchAll(re)) {
        if (used.slice(m.index, m.index + m[0].length).some(Boolean)) continue
        used.fill(true, m.index, m.index + m[0].length)
        const after = PART.exec(g.slice(m.index + m[0].length, m.index + m[0].length + 45))
        const p = after && (after[1] || after[2]) ? ROMAN[after[1] || after[2]] : part
        out.push(...make(m, p))
      }
    }
  }
  return out
}
