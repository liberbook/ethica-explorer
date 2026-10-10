// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Natura Naturans
// Builds ethica-explorer/ethica.html: one self-contained page (no network needed) with the text of the
// Ethics, every cross-reference resolved, the Latin original alongside and the audit of the sources.
//
//   node tools/build.js                    # writes ethica.html and data/ethica.json
//   node tools/build.js --check            # only the audit, exits 1 when a reference is unresolved
//   node tools/build.js --corpus <file>    # also audit another annotated corpus of the text
//   node tools/build.js --out <dir>        # write ethica.html as <dir>/index.html (for a web site)
//   node tools/build.js --export-corpus <file>  # also write the corpus in the spinoza bot's format
//
// Pipeline: source text (Ivantsov) -> parse-ru -> gaps (Modestov) -> source fixes -> annotate -> Latin
// cross-check -> (optional) audit of another corpus -> page.
import fs from "node:fs"
import path from "node:path"
import {parseRussian} from "./parse-ru.js"
import {annotate} from "./annotate.js"
import {latinRefs} from "./latin-refs.js"
import {toRid, describe} from "./ids.js"

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, "..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")
const readJson = (p) => JSON.parse(read(p))

// ---- 1. text ---------------------------------------------------------------------------------
let entries = parseRussian(read("source/ethica_ru_ivantsov.txt"))
const byId = () => Object.fromEntries(entries.map((e) => [e.id, e]))

// ---- 2. passages the edition leaves out, from Modestov's translation --------------------------
const gaps = readJson("source/gaps-modestov.json")
const applied = {gaps: [], fixes: []}
for (const g of gaps.fill) {
  const e = byId()[g.id]
  if (g.mode === "new") {
    if (e) throw new Error(`gap ${g.id} already exists`)
    const at = entries.findIndex((x) => x.id === g.after)
    if (at < 0) throw new Error(`gap ${g.id}: no ${g.after}`)
    const parent = byId()[g.parent]
    const item = {id: g.id, part: parent.part, type: g.type, number: g.number, parent: g.parent, text: `⟦${g.text}⟧`}
    if (g.of) item.of = g.of
    if (g.label) item.label = g.label
    entries.splice(at + 1, 0, item)
  } else {
    if (!e) throw new Error(`gap ${g.id}: no such entry`)
    if (g.mode === "replace") e.text = `⟦${g.text}⟧`
    else if (g.mode === "drop-ellipsis") e.text = e.text.replace(/\s*‹…›/, "")
    else if (g.mode === "ellipsis") {
      if (!e.text.includes("‹…›")) throw new Error(`gap ${g.id}: no ‹…› to fill`)
      e.text = e.text.replace("‹…›", `⟦${g.text}⟧`)
    } else throw new Error(`gap ${g.id}: unknown mode ${g.mode}`)
  }
  applied.gaps.push({id: g.id, mode: g.mode, why: g.why})
}

// ---- 3. corrections of misprints and dropped citations ---------------------------------------
for (const f of readJson("tools/source-fixes.json").fixes) {
  const e = byId()[f.id]
  if (!e) throw new Error(`fix ${f.id}: no such entry`)
  if (!e.text.includes(f.from)) throw new Error(`fix ${f.id}: "${f.from}" not found`)
  e.text = e.text.replace(f.from, f.to)
  applied.fixes.push(f)
}

// ---- 4. references ------------------------------------------------------------------------------
const {entries: annotated, issues} = annotate(entries)
entries = annotated
const index = byId()
const top = (id) => {
  let e = index[id]
  while (e && e.parent) e = index[e.parent]
  return e ? e.id : id
}

// ---- 5. Latin text and the cross-check --------------------------------------------------------
const latin = readJson("source/ethica_la.json").segments
const latinId = (e) => (e.of ? `${e.of}dem` : e.id)
const crossCheck = []
for (const e of entries) {
  const la = latin[latinId(e)]
  if (la) e.la = la.text
  if (!la) continue
  const own = top(e.id)
  const L = new Set(latinRefs(la.text, la.part).map(top).filter((x) => x !== own))
  const R = new Set(e.refs.map(top).filter((x) => x !== own))
  const latinOnly = [...L].filter((x) => !R.has(x) && index[x])
  const russianOnly = [...R].filter((x) => !L.has(x))
  if (latinOnly.length || russianOnly.length) crossCheck.push({id: e.id, latinOnly, russianOnly})
}

// ---- 6. optional: audit of another annotated corpus of the same text (--corpus <file>), e.g. the
// a chat bot's copy of the text with bracketed identifiers: where they differ from this annotation
const corpusArg = process.argv.indexOf("--corpus")
let corpusAudit = null
if (corpusArg > 0) {
  const corpus = JSON.parse(fs.readFileSync(path.resolve(process.argv[corpusArg + 1]), "utf8"))
  const RU2EN = [["аксф", "physax"], ["опрф", "physdef"], ["приб", "app"], ["пред", "pref"], ["пост", "post"], ["афф", "aff"], ["ооа", "gda"], ["опр", "d"], ["акс", "a"], ["лем", "lem"], ["док", "dem"], ["кор", "c"], ["сх", "s"], ["об", "exp"], ["т", "p"]]
  const fromRid = (r) => {
    const m = /^Э?(\d)(.*)$/.exec(r.trim())
    if (!m) return r.trim()
    let rest = m[2]
    for (const [ru, en] of RU2EN) rest = rest.replaceAll(ru, en)
    return m[1] + rest
  }
  // the corpus numbers the axioms about bodies 1-3 (only the three after lemma 3, all empty)
  const corpusPhys = {"2physax1": "2physax3", "2physax2": "2physax4", "2physax3": "2physax5"}
  corpusAudit = {missingEntries: [], extraEntries: [], emptyEntries: [], truncated: [], refDiffs: []}
  for (const e of entries) if (!corpus[e.id] && !e.id.startsWith("2physax") && e.id !== "2physdef") corpusAudit.missingEntries.push(e.id)
  for (const [id, c] of Object.entries(corpus)) {
    if (!c.text.trim()) corpusAudit.emptyEntries.push(id)
    if (c.text.includes("‹…›")) corpusAudit.truncated.push(id)
    if (!index[id] && !id.startsWith("note") && !corpusPhys[id]) corpusAudit.extraEntries.push(id)
    const e = index[id]
    if (!e) continue
    const theirs = []
    for (const m of c.text.matchAll(/\[([^\]]+)\]/g)) for (const t of m[1].split(",")) { const k = fromRid(t); theirs.push(corpusPhys[k] ?? k) }
    const ours = e.refs
    const a = new Set(theirs), b = new Set(ours)
    const corpusOnly = [...a].filter((x) => !b.has(x)), oursOnly = [...b].filter((x) => !a.has(x))
    if (corpusOnly.length || oursOnly.length) corpusAudit.refDiffs.push({id, corpusOnly, missingInCorpus: oursOnly})
  }

}

// ---- 6b. optional: the corpus in the format of the spinoza bot (--export-corpus <file>):
// {id: {id, part, type, number, parent, text, rid, rparent?, full?}}, ids and bracketed identifiers as here,
// text without the ⟦ ⟧ marks of borrowed passages, demonstrations unnumbered as in the bot's corpus
const exportArg = process.argv.indexOf("--export-corpus")
if (exportArg > 0) {
  const clean = (t) => t.replace(/[⟦⟧]/g, "")
  const out = {}
  const physNo = (id) => Number(id.replace("2physax", ""))
  for (const e of entries) {
    const item = {id: e.id, part: e.part, type: e.type, number: e.type === "доказательство" ? null : e.id.startsWith("2physax") ? physNo(e.id) : e.number ?? null, parent: e.parent ?? null, text: clean(e.text), rid: toRid(e.id)}
    if (e.parent) item.rparent = toRid(e.parent)
    if (e.type === "теорема" || e.type === "лемма") {
      const kidsOf = entries.filter((k) => k.parent === e.id)
      const head = (k) => k.type === "доказательство" ? "Доказательство" : `${k.type.charAt(0).toUpperCase()}${k.type.slice(1)}${k.number ? ` ${k.number}` : ""}`
      item.full = [clean(e.text), ...kidsOf.map((k) => `[${head(k)}] ${clean(k.text)}`)].join("\n\n")
    }
    out[e.id] = item
  }
  fs.writeFileSync(path.resolve(process.argv[exportArg + 1]), JSON.stringify(out, null, 1) + "\n")
  console.log(`exported ${Object.keys(out).length} passages to ${process.argv[exportArg + 1]}`)
}

// ---- 7. output -------------------------------------------------------------------------------------
const data = {
  built: new Date().toISOString().slice(0, 10),
  sources: {
    ru: "Б. Спиноза. Этика, доказанная в геометрическом порядке. Перевод с латинского Н. А. Иванцова.",
    gaps: `Пропуски издания восполнены по переводу ${gaps.translator} (1886); такие места выделены.`,
    la: "Benedictus de Spinoza, Ethica ordine geometrico demonstrata (1677), текст la.wikisource.org.",
  },
  entries: entries.map((e) => ({id: e.id, rid: toRid(e.id), part: e.part, type: e.type, number: e.number, parent: e.parent, of: e.of, label: describe(e, index), text: e.text, refs: e.refs, la: e.la})),
  audit: {issues, gaps: applied.gaps, fixes: applied.fixes, crossCheck, corpus: corpusAudit},
}

const unresolved = issues.length
console.log(`${data.entries.length} passages, ${data.entries.reduce((n, e) => n + e.refs.length, 0)} references, ${unresolved} unresolved, ${applied.fixes.length} fixes, ${applied.gaps.length} gaps filled, Latin disagreements in ${crossCheck.length} passages, ${corpusAudit ? `other corpus differs in ${corpusAudit.refDiffs.length}` : "no corpus audit"}`)
for (const i of issues) console.log(`  unresolved ${i.id}: ${i.problem} | ${i.at}`)
if (process.argv.includes("--audit")) fs.writeFileSync(process.argv[process.argv.indexOf("--audit") + 1], JSON.stringify(data, null, 1))
if (process.argv.includes("--check")) process.exit(unresolved ? 1 : 0)

fs.mkdirSync(path.join(ROOT, "data"), {recursive: true})
fs.writeFileSync(path.join(ROOT, "data", "ethica.json"), JSON.stringify(data))
const page = read("app/index.html")
  .replace("/*STYLE*/", () => read("app/app.css"))
  .replace("/*DATA*/", () => `window.ETHICA = ${JSON.stringify(data).replace(/</g, "\\u003c")};`)
  .replace("/*SCRIPT*/", () => read("app/app.js"))
const outArg = process.argv.indexOf("--out")
const target = outArg > 0 ? path.resolve(process.argv[outArg + 1], "index.html") : path.join(ROOT, "ethica.html")
fs.mkdirSync(path.dirname(target), {recursive: true})
fs.writeFileSync(target, page)
console.log(`wrote ${path.relative(process.cwd(), target)} (${Math.round(page.length / 1024)} KB)`)
