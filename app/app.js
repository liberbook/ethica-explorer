// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Natura Naturans
// Ethica explorer: reader with expandable references, full proof chains, statistics and the map of
// dependencies. Data: window.ETHICA (built by tools/build.js). No libraries.
"use strict"
;(() => {
const D = window.ETHICA
const $ = (s, el = document) => el.querySelector(s)
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === "class") el.className = v
    else if (k === "html") el.innerHTML = v
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? "" : v)
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  return el
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c])
const ROMAN = ["", "I", "II", "III", "IV", "V"]
const PART_NAMES = ["Примечания переводчика", "О Боге", "О природе и происхождении души", "О происхождении и природе аффектов", "О человеческом рабстве, или о силах аффектов", "О могуществе разума, или о человеческой свободе"]
const partVar = (p) => (p ? `var(--p${p})` : "var(--ink-3)")
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many }
const fmt = (n) => n.toLocaleString("ru-RU")

// ---------------------------------------------------------------- model
const E = new Map(D.entries.map((e) => [e.id, e]))
const order = D.entries.map((e) => e.id)
const pos = new Map(order.map((id, i) => [id, i]))
const ridToId = new Map(D.entries.map((e) => [e.rid, e.id]))
const kids = new Map()
for (const e of D.entries) if (e.parent) (kids.get(e.parent) ?? kids.set(e.parent, []).get(e.parent)).push(e)
const topOf = (id) => { let e = E.get(id); while (e && e.parent) e = E.get(e.parent); return e ? e.id : id }
const tops = D.entries.filter((e) => !e.parent)
const isPrinciple = (e) => /^(определение|аксиома|постулат|определение аффекта|общее определение аффектов|аксиома \(о телах\)|определение \(о телах\))$/.test(e.type)
const isProposition = (e) => e.type === "теорема" || e.type === "лемма"
// a reference made in a demonstration / corollary / statement is part of the proof; one made in a
// scholium, explanation, preface, appendix or note is commentary
const DISCURSIVE = new Set(["схолия", "объяснение", "предисловие", "прибавление", "прибавление (глава)", "примечание"])
const isLogical = (seg) => !DISCURSIVE.has(seg.type)
const isPremise = (e) => !DISCURSIVE.has(e.type) // a preface or appendix chapter is never a premise
const shortType = {"определение": "опр.", "аксиома": "акс.", "постулат": "пост.", "теорема": "теор.", "лемма": "лемма", "определение аффекта": "опр. аффекта", "общее определение аффектов": "общ. опр.", "аксиома (о телах)": "акс. о телах", "определение (о телах)": "опр. о телах", "предисловие": "предисл.", "прибавление": "прибавл.", "прибавление (глава)": "глава", "примечание": "прим.", "доказательство": "док.", "королларий": "кор.", "схолия": "сх.", "объяснение": "объясн."}

// every occurrence of a reference: {seg, segTop, to, toTop, logical, at}
const occ = []
for (const e of D.entries) {
  if (!e.refs.length) continue
  let at = 0
  for (const m of e.text.matchAll(/\[([^\]]+)\]/g)) {
    for (const rid of m[1].split(",").map((s) => s.trim())) {
      const to = ridToId.get(rid)
      if (!to || to.startsWith("note")) continue
      occ.push({seg: e.id, segTop: topOf(e.id), to, toTop: topOf(to), logical: isLogical(e) && isPremise(E.get(topOf(to))), at: m.index})
    }
    at++
  }
}
// top-level graph: deps (what X rests on) and users (what rests on X); logical only and all
const graph = {logical: build(true), all: build(false)}
function build(logicalOnly) {
  const deps = new Map(), users = new Map()
  for (const t of tops) { deps.set(t.id, new Set()); users.set(t.id, new Set()) }
  for (const o of occ) {
    if (logicalOnly && !o.logical) continue
    if (o.segTop === o.toTop) continue
    deps.get(o.segTop).add(o.toTop)
    users.get(o.toTop).add(o.segTop)
  }
  return {deps, users}
}
// depth = the longest chain of logical dependencies down to first principles
const depth = new Map()
const cycles = []
{
  const state = new Map()
  const visit = (id, stack) => {
    if (depth.has(id)) return depth.get(id)
    if (state.get(id) === 1) { cycles.push([...stack, id]); return 0 }
    state.set(id, 1)
    let d = 0
    for (const x of graph.logical.deps.get(id) ?? []) d = Math.max(d, visit(x, [...stack, id]) + 1)
    state.set(id, 2)
    depth.set(id, d)
    return d
  }
  for (const t of tops) visit(t.id, [])
}
const memo = {anc: new Map(), desc: new Map()}
function closure(id, kind) {
  const cache = memo[kind]
  if (cache.has(id)) return cache.get(id)
  const rel = kind === "anc" ? graph.logical.deps : graph.logical.users
  const seen = new Set(), stack = [...(rel.get(id) ?? [])]
  while (stack.length) { const x = stack.pop(); if (seen.has(x) || x === id) continue; seen.add(x); for (const y of rel.get(x) ?? []) stack.push(y) }
  cache.set(id, seen)
  return seen
}
const sortReading = (ids) => [...ids].sort((a, b) => pos.get(a) - pos.get(b))

// "Э1т7", "э1т7", "1т7", "E1p7", "1p7dem", "Прим24", "1 7" -> id
const RU2EN = [["аксф", "physax"], ["опрф", "physdef"], ["приб", "app"], ["пред", "pref"], ["пост", "post"], ["афф", "aff"], ["ооа", "gda"], ["опр", "d"], ["акс", "a"], ["лем", "lem"], ["док", "dem"], ["кор", "c"], ["сх", "s"], ["об", "exp"], ["т", "p"]]
function parseId(q) {
  let s = q.trim().replace(/\s+/g, "")
  if (!s) return null
  if (E.has(s)) return s
  let m = /^[Пп]рим\.?(\d+)$/.exec(s)
  if (m) return E.has(`note${m[1]}`) ? `note${m[1]}` : null
  if (/^[EeЕе]?\d/.test(s) && !/[а-яё]/i.test(s.slice(1))) { const id = s.replace(/^[EeЕе]/, "").toLowerCase(); return E.has(id) ? id : null }
  m = /^[Ээ]?(\d)(.*)$/.exec(s.toLowerCase())
  if (!m) return null
  let rest = m[2]
  for (const [ru, en] of RU2EN) rest = rest.replaceAll(ru, en)
  const id = m[1] + rest
  return E.has(id) ? id : null
}

// ---------------------------------------------------------------- text rendering
const snippet = (s, n = 140) => { const t = plain(s); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t }
function plain(s) { return s.replace(/\s*\[[^\]]+\]/g, "").replace(/[⟦⟧]/g, "").replace(/\s+/g, " ").trim() }

/** HTML of a passage: paragraphs, reference chips, Modestov's passages marked. */
function richText(text) {
  const parts = text.split("\n").map((para) => {
    let s = esc(para)
    s = s.replace(/⟦/g, '<span class="alt" title="Восполнено по переводу В. И. Модестова">').replace(/⟧/g, "</span>")
    s = s.replace(/\s*\[([^\]]+)\]/g, (all, inner) => {
      const rids = inner.split(",").map((x) => x.trim())
      if (!rids.every((r) => ridToId.has(r))) return all
      return " " + rids.map((r) => { const id = ridToId.get(r), e = E.get(id); return `<button type="button" class="ref${id.startsWith("note") ? " note" : ""}" data-id="${id}" style="--part:${partVar(e.part)}" title="${esc(e.label)}">${esc(r)}</button>` }).join("")
    })
    return `<p>${s}</p>`
  })
  return parts.join("")
}

const segName = (e) => {
  if (e.label && e.parent) return e.label.split(" · ").pop()
  const t = e.type.charAt(0).toUpperCase() + e.type.slice(1)
  return e.number && e.type !== "доказательство" ? `${t} ${e.number}` : e.number && e.type === "доказательство" ? `${t} ${e.number}` : t
}
const titleOf = (e) => e.label

// ---------------------------------------------------------------- state & routing
const state = {tab: "text", id: "1d1", latin: false, scope: "logical", graphId: "5p42"}
try { state.latin = localStorage.getItem("ethica.latin") === "1" } catch {}
function go(tab, id) { location.hash = id ? `#/${tab}/${id}` : `#/${tab}` }
function route() {
  const m = /^#\/(text|book|graph|audit)(?:\/(.+))?$/.exec(decodeURIComponent(location.hash))
  const tab = m ? m[1] : "text"
  let id = m && m[2] ? m[2] : null
  if (id && !E.has(id)) id = parseId(id)
  state.tab = tab
  for (const t of ["text", "book", "graph", "audit"]) $(`#view-${t}`).classList.toggle("on", t === tab)
  for (const a of document.querySelectorAll(".tabs a")) a.setAttribute("aria-selected", a.dataset.tab === tab)
  if (tab === "text") {
    const target = id ?? state.id
    const top = topOf(target)
    if (top !== state.renderedTop) { state.id = top; renderReader(top); renderSide(top); markToc(top) }
    if (target !== top) { const el = document.getElementById(`seg-${target}`); if (el) el.scrollIntoView({block: "start"}) }
  } else if (tab === "book") { renderBook(id) }
  else if (tab === "graph") { if (id) state.graphId = topOf(id); renderGraph() }
  else renderAudit()
}
addEventListener("hashchange", route)

// ---------------------------------------------------------------- table of contents
function tocGroups() {
  const groups = []
  for (let p = 1; p <= 5; p++) {
    const inPart = tops.filter((e) => e.part === p)
    const sec = (name, pred) => { const items = inPart.filter(pred); if (items.length) groups.push({p, name, items}) }
    sec("Предисловие", (e) => e.type === "предисловие")
    sec("Определения", (e) => e.type === "определение")
    sec("Аксиомы", (e) => e.type === "аксиома")
    sec("Постулаты", (e) => e.type === "постулат")
    sec("Теоремы", (e) => e.type === "теорема")
    sec("О телах: леммы, аксиомы, определение", (e) => /лемма|о телах/.test(e.type))
    sec("Определения аффектов", (e) => /аффект/.test(e.type))
    sec("Прибавление", (e) => /прибавление/.test(e.type))
  }
  groups.push({p: 0, name: "Примечания", items: tops.filter((e) => e.part === 0)})
  return groups
}
function renderToc(hits = null, query = "") {
  const toc = $("#toc")
  toc.innerHTML = ""
  if (hits) {
    toc.append(h("div", {class: "hits-head"}, hits.length ? `Найдено: ${hits.length}` : "Ничего не найдено", " · ", h("a", {href: "#", style: "display:inline;padding:0", onclick: (ev) => { ev.preventDefault(); $("#q").value = ""; renderToc(); markToc(state.id) }}, "оглавление")))
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    for (const e of hits.slice(0, 300)) {
      const t = plain(e.text), i = t.search(re)
      const frag = i < 0 ? t.slice(0, 80) : (i > 30 ? "…" : "") + t.slice(Math.max(0, i - 30), i + 70)
      toc.append(h("a", {href: `#/text/${e.id}`, html: `<span class="n">${esc(e.rid)}</span><span class="t">${esc(frag).replace(re, (x) => `<mark>${x}</mark>`)}</span>`}))
    }
    return
  }
  let lastPart = -1
  for (const g of tocGroups()) {
    if (g.p !== lastPart) {
      lastPart = g.p
      toc.append(h("h4", {}, h("span", {class: "dot", style: `background:${partVar(g.p)}`}), g.p ? `Часть ${ROMAN[g.p]} · ${PART_NAMES[g.p]}` : "Примечания"))
    }
    const det = h("details", {"data-part": g.p}, h("summary", {}, `${g.name} `, h("span", {class: "hint"}, g.items.length)))
    for (const e of g.items) det.append(h("a", {href: `#/text/${e.id}`, "data-id": e.id}, h("span", {class: "n"}, e.rid), h("span", {class: "t"}, snippet(e.text, 70))))
    toc.append(det)
  }
}
/** Scrolls only `box` (a contents list) so that `el` is visible - never the page itself. */
function revealIn(box, el) {
  if (box.scrollHeight <= box.clientHeight) return
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect()
  if (r.top < b.top) box.scrollTop -= b.top - r.top + 8
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8
}
function markToc(id) {
  for (const a of document.querySelectorAll(".toc a.cur")) a.classList.remove("cur")
  const a = $(`.toc a[data-id="${id}"]`)
  if (!a) return
  a.classList.add("cur")
  a.closest("details").open = true
  revealIn($("#toc"), a)
}

// ---------------------------------------------------------------- reader
function segBlock(e, isTop, prefix = "seg") {
  const box = h("section", {class: "seg", id: `${prefix}-${e.id}`})
  if (!isTop) box.append(h("div", {class: "seg-head"}, segName(e), h("a", {class: "rid", href: `#/text/${e.id}`, title: "Ссылка на это место"}, e.rid)))
  const body = h("div", {class: isTop && (isProposition(e) || isPrinciple(e)) ? "statement" : "prose", style: `--part:${partVar(e.part)}`, html: richText(e.text)})
  box.append(body)
  if (e.text.includes("⟦")) box.append(h("div", {class: "alt-note"}, "Выделенный фрагмент отсутствует в издании Иванцова и дан по переводу В. И. Модестова (1886)."))
  if (state.latin && e.la) box.append(h("div", {class: "latin"}, e.la))
  return box
}
function renderReader(id) {
  state.renderedTop = id
  const e = E.get(id)
  const r = $("#reader")
  r.innerHTML = ""
  r.scrollTop = 0
  const inner = h("div", {class: "reader-inner"})
  const pathBits = e.label.split(" · ")
  inner.append(h("div", {class: "crumbs"}, h("span", {class: "part-dot", style: `background:${partVar(e.part)}`}), h("span", {class: "rid"}, e.rid), e.part ? `Часть ${ROMAN[e.part]} · ${PART_NAMES[e.part]}` : "Примечание"))
  inner.append(h("h1", {class: "title"}, pathBits.slice(e.part ? 1 : 0).join(" · ")))
  const anc = closure(id, "anc")
  const tb = h("div", {class: "toolbar"},
    h("button", {class: "btn", type: "button", title: "Раскрыть все упомянутые положения на один уровень", onclick: () => expandAll(inner)}, "Раскрыть все ссылки"),
    h("button", {class: "btn", type: "button", title: "Свернуть раскрытые ссылки", onclick: () => collapseAll(inner)}, "Свернуть"),
    anc.size ? h("button", {class: "btn", type: "button", title: "Все положения, на которых держится доказательство, от первых начал", onclick: () => showChain(id)}, `Полная цепочка · ${anc.size}`) : null,
    h("button", {class: `btn${state.latin ? " on" : ""}`, type: "button", onclick: () => { state.latin = !state.latin; try { localStorage.setItem("ethica.latin", state.latin ? "1" : "0") } catch {} renderReader(id) }}, "Латынь"),
    h("a", {class: "btn", href: `#/graph/${id}`}, "На карте связей"),
    h("a", {class: "btn", href: `#/book/${id}`, title: "Читать подряд с этого места"}, "В книге"),
  )
  inner.append(tb)
  inner.append(segBlock(e, true))
  for (const k of kids.get(id) ?? []) inner.append(segBlock(k, false))
  const i = tops.indexOf(e)
  const prev = tops[i - 1], next = tops[i + 1]
  inner.append(h("div", {class: "pager"}, prev ? h("a", {class: "btn", href: `#/text/${prev.id}`}, `← ${prev.rid} · ${snippet(prev.text, 40)}`) : h("span"), next ? h("a", {class: "btn", href: `#/text/${next.id}`}, `${next.rid} · ${snippet(next.text, 40)} →`) : h("span")))
  inner.append(h("div", {id: "chain"}))
  r.append(inner)
}

// a reference chip opens the cited passage inline, under its paragraph; references inside it open the same way
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".ref")
  if (!btn) return
  ev.preventDefault()
  const id = btn.dataset.id
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey) { go("text", id); return }
  toggleNest(btn, id)
})
function toggleNest(btn, id) {
  const para = btn.closest("p")
  const key = `n-${id}`
  const existing = [...para.parentElement.children].find((el) => el.classList?.contains("nest") && el.dataset.key === key && el.dataset.from === btnKey(btn))
  if (existing) { existing.remove(); btn.classList.remove("open"); return }
  const depthNow = btn.closest(".nest") ? Number(btn.closest(".nest").dataset.depth) + 1 : 1
  const card = nestCard(id, depthNow)
  card.dataset.key = key
  card.dataset.from = btnKey(btn)
  let after = para
  while (after.nextElementSibling && after.nextElementSibling.classList.contains("nest")) after = after.nextElementSibling
  after.after(card)
  btn.classList.add("open")
}
let btnSeq = 0
const btnKey = (btn) => btn.dataset.k ?? (btn.dataset.k = `b${++btnSeq}`)
function nestCard(id, depthNow) {
  const e = E.get(id), top = E.get(topOf(id))
  const card = h("div", {class: "nest", style: `--part:${partVar(e.part)}`, "data-depth": depthNow})
  card.append(h("div", {class: "nest-head"}, h("b", {}, e.rid), e.label, h("a", {class: "go", href: `#/text/${id}`}, "открыть →"), h("button", {class: "x", type: "button", title: "Свернуть", onclick: () => { card.remove(); for (const b of document.querySelectorAll(`.ref.open[data-k]`)) if (b.dataset.k === card.dataset.from) b.classList.remove("open") }}, "×")))
  if (e.parent) {
    // a corollary / scholium / demonstration: the theorem it belongs to, then the passage itself
    if (top.id !== id && e.type !== "доказательство") card.append(h("div", {class: "stmt", html: richText(`${top.rid}. ${top.text}`)}))
    card.append(h("div", {html: richText(e.text)}))
    if (e.type === "королларий") {
      const dem = (kids.get(top.id) ?? []).find((k) => k.of === e.id)
      if (dem) card.append(h("div", {class: "sub"}, "Доказательство короллария"), h("div", {html: richText(dem.text)}))
    }
  } else {
    card.append(h("div", {class: "stmt", html: richText(e.text)}))
    const ks = kids.get(id) ?? []
    const dems = ks.filter((k) => k.type === "доказательство" && !k.of)
    for (const d of dems) card.append(h("div", {class: "sub"}, segName(d)), h("div", {html: richText(d.text)}))
    const rest = ks.filter((k) => !dems.includes(k))
    if (rest.length) {
      const more = h("button", {class: "more", type: "button"}, `Ещё: ${rest.map(segName).join(", ")}`)
      more.onclick = () => { for (const k of rest) more.before(h("div", {class: "sub"}, segName(k)), h("div", {html: richText(k.text)})); more.remove() }
      card.append(more)
    }
  }
  if (state.latin && e.la) card.append(h("div", {class: "latin"}, e.la))
  return card
}
function expandAll(root) {
  for (const btn of root.querySelectorAll(".reader-inner > .seg .ref:not(.open):not(.note)")) toggleNest(btn, btn.dataset.id)
}
function collapseAll(root) {
  for (const n of root.querySelectorAll(".nest")) n.remove()
  for (const b of root.querySelectorAll(".ref.open")) b.classList.remove("open")
}
function showChain(id) {
  const box = $("#chain")
  if (box.childElementCount) { box.innerHTML = ""; return }
  const ids = [...closure(id, "anc")].sort((a, b) => depth.get(a) - depth.get(b) || pos.get(a) - pos.get(b))
  const count = (pred) => ids.filter((x) => pred(E.get(x))).length
  box.append(h("h2", {class: "title", style: "font-size:21px;margin-top:40px"}, `Полная цепочка: ${ids.length} ${plural(ids.length, "положение", "положения", "положений")}`))
  box.append(h("p", {class: "chain-legend"}, `Всё, на что опирается ${E.get(id).rid} в доказательствах и королларииях, вплоть до первых начал: ${count((e) => /определение/.test(e.type))} опред., ${count((e) => /аксиома/.test(e.type))} акс., ${count((e) => e.type === "постулат")} пост., ${count(isProposition)} теорем и лемм. Порядок — от оснований к выводам (по уровню вывода). Каждую ссылку можно раскрыть.`))
  const list = h("div", {class: "chain"})
  for (const x of ids) {
    const e = E.get(x)
    const cell = h("div", {style: `--part:${partVar(e.part)}`}, h("span", {class: "lvl"}, `уровень ${depth.get(x)}`), h("a", {href: `#/text/${x}`, class: "mono", style: "text-decoration:none;font-weight:600"}, e.rid), " ", h("span", {class: "hint"}, e.label.split(" · ").slice(1).join(" · ")), h("div", {html: richText(e.text)}))
    const dems = (kids.get(x) ?? []).filter((k) => k.type === "доказательство" || k.type === "королларий")
    if (dems.length) {
      const d = h("details", {}, h("summary", {}, dems.map(segName).join(", ")))
      for (const k of dems) d.append(h("div", {class: "nest-head", style: "margin-top:8px"}, segName(k)), h("div", {html: richText(k.text)}))
      cell.append(d)
    }
    list.append(h("div", {class: "chain-item"}, cell))
  }
  box.append(list)
  box.scrollIntoView({behavior: "smooth", block: "start"})
}


// ---------------------------------------------------------------- book: the whole text, part by part
const BOOK_PARTS = [1, 2, 3, 4, 5, 0]
let bookObserver = null
function savedBookPlace() { try { return localStorage.getItem("ethica.book") } catch { return null } }
function renderBook(id) {
  // which part: the one of the requested passage, else the remembered place, else part I
  const want = id ? topOf(id) : savedBookPlace() && E.has(savedBookPlace()) ? savedBookPlace() : "1d1"
  const part = E.get(want).part
  const main = $("#book")
  if (main.dataset.part !== String(part) || main.dataset.latin !== String(state.latin)) buildBookPart(part)
  requestAnimationFrame(() => {
    const target = document.getElementById(`book-${id ?? want}`)
    if (target && (id || want !== `${part}d1`)) target.scrollIntoView({block: "start"})
    else main.scrollTop = 0
  })
}
/** The heading a passage stands under in the book. */
function bookSection(e) {
  const t = e.type
  if (t === "предисловие") return "Предисловие"
  if (t === "определение") return "Определения"
  if (t === "аксиома") return "Аксиомы"
  if (t === "постулат") return "Постулаты"
  if (t === "теорема") return "Теоремы"
  if (t === "лемма" || /о телах/.test(t)) return "О природе тел: аксиомы, леммы, определение"
  if (/аффект/.test(t)) return "Определения аффектов"
  if (/прибавление/.test(t)) return "Прибавление"
  if (t === "примечание") return "Примечания переводчика"
  return t
}
function buildBookPart(part) {
  const main = $("#book"), toc = $("#book-toc")
  main.dataset.part = String(part)
  main.dataset.latin = String(state.latin)
  main.innerHTML = ""
  toc.innerHTML = ""
  const inner = h("div", {class: "reader-inner"})
  // part switcher + latin
  inner.append(h("div", {class: "book-bar"},
    h("div", {class: "seg-switch"}, BOOK_PARTS.map((p) => h("button", {type: "button", class: p === part ? "on" : "", title: p ? PART_NAMES[p] : "Примечания переводчика", onclick: () => { buildBookPart(p); $("#book").scrollTop = 0; history.replaceState(null, "", `#/book/${tops.find((e) => e.part === p).id}`) }}, p ? ROMAN[p] : "Прим."))),
    h("button", {class: `btn${state.latin ? " on" : ""}`, type: "button", onclick: () => { state.latin = !state.latin; try { localStorage.setItem("ethica.latin", state.latin ? "1" : "0") } catch {} const keep = currentBookId(); buildBookPart(part); document.getElementById(`book-${keep}`)?.scrollIntoView({block: "start"}) }}, "Латынь"),
    h("button", {class: "btn", type: "button", onclick: () => collapseAll(main)}, "Свернуть ссылки")))
  inner.append(h("h1", {class: "book-title"}, part ? `Часть ${ROMAN[part]}` : "Примечания переводчика", part ? h("span", {}, PART_NAMES[part]) : null))
  toc.append(h("h4", {}, h("span", {class: "dot", style: `background:${partVar(part)}`}), part ? `Часть ${ROMAN[part]} · ${PART_NAMES[part]}` : "Примечания"))
  // sections in the order of the book: in part II the digression on bodies (lemmas, axioms,
  // definition, postulates) stands between theorems 13 and 14, so "Теоремы" occurs twice
  const runs = []
  for (const e of tops.filter((x) => x.part === part)) {
    const name = bookSection(e)
    if (!runs.length || runs[runs.length - 1].name !== name) runs.push({name, items: []})
    runs[runs.length - 1].items.push(e)
  }
  for (const run of runs) {
    const first = run.items[0], last = run.items[run.items.length - 1]
    const range = run.name === "Теоремы" && runs.filter((r) => r.name === "Теоремы").length > 1 ? ` ${first.number}–${last.number}` : ""
    inner.append(h("h2", {class: "book-section"}, run.name + range))
    const det = h("details", {open: runs.length < 4 ? true : null}, h("summary", {}, `${run.name}${range} `, h("span", {class: "hint"}, run.items.length)))
    for (const e of run.items) {
      det.append(h("a", {href: `#/book/${e.id}`, "data-id": e.id, onclick: (ev) => { ev.preventDefault(); document.getElementById(`book-${e.id}`).scrollIntoView({block: "start"}) }}, h("span", {class: "n"}, e.rid), h("span", {class: "t"}, snippet(e.text, 70))))
      const art = h("article", {class: "book-entry", id: `book-${e.id}`, "data-id": e.id, style: `--part:${partVar(e.part)}`})
      art.append(h("div", {class: "book-head"}, h("span", {class: "rid"}, e.rid), h("span", {}, e.label.split(" · ").slice(e.part ? 1 : 0).join(" · ")), h("a", {class: "go", href: `#/text/${e.id}`, title: "Открыть с зависимостями"}, "связи →")))
      art.append(segBlock(e, true, "bk"))
      for (const k of kids.get(e.id) ?? []) art.append(segBlock(k, false, "bk"))
      inner.append(art)
    }
    toc.append(det)
  }
  const next = BOOK_PARTS[BOOK_PARTS.indexOf(part) + 1]
  if (next !== undefined) inner.append(h("div", {class: "pager"}, h("span"), h("button", {class: "btn", type: "button", onclick: () => { buildBookPart(next); $("#book").scrollTop = 0 }}, next ? `Часть ${ROMAN[next]} · ${PART_NAMES[next]} →` : "Примечания переводчика →")))
  main.append(inner)
  // follow the reading position: highlight it in the contents, remember it, keep it in the address
  bookObserver?.disconnect()
  bookObserver = new IntersectionObserver((items) => {
    const vis = items.filter((i) => i.isIntersecting).map((i) => i.target.dataset.id)
    if (!vis.length || state.tab !== "book") return
    const id = currentBookId()
    for (const a of toc.querySelectorAll("a.cur")) a.classList.remove("cur")
    const a = toc.querySelector(`a[data-id="${id}"]`)
    if (a) { a.classList.add("cur"); a.closest("details").open = true; revealIn(toc, a) }
    try { localStorage.setItem("ethica.book", id) } catch {}
    history.replaceState(null, "", `#/book/${id}`)
  }, {root: main.scrollHeight > main.clientHeight + 1 ? main : null, rootMargin: "0px 0px -70% 0px"})
  for (const art of inner.querySelectorAll(".book-entry")) bookObserver.observe(art)
}
/** The passage at the top of the book view. */
function currentBookId() {
  const main = $("#book"), top = Math.max(main.getBoundingClientRect().top, $(".top").getBoundingClientRect().bottom, 0) + 8
  let cur = null
  for (const art of main.querySelectorAll(".book-entry")) { if (art.getBoundingClientRect().top - top <= 60) cur = art.dataset.id; else break }
  return cur ?? main.querySelector(".book-entry")?.dataset.id
}

// ---------------------------------------------------------------- side panel: dependencies
/** "Доказательство: «…т. е. (по т. 7) природе которой необходимо присуще…»" - how a passage is cited. */
function contextOf(o) {
  const seg = E.get(o.seg)
  const t = seg.text
  // the clause around the reference: back to a sentence or clause start, forward a little
  let start = Math.max(0, o.at - 110)
  const back = t.slice(start, o.at)
  const cut = Math.max(back.lastIndexOf(". ") > 0 && !/(?:т|ч|опр|акс|кор|сх|пост|лем|т\. е|см|пред)\.\s$/.test(back.slice(0, back.lastIndexOf(". ") + 2)) ? back.lastIndexOf(". ") + 2 : -1, back.lastIndexOf("; ") + 2)
  if (cut > 1) start += cut
  else if (start > 0) start += back.indexOf(" ") + 1
  let end = Math.min(t.length, o.at + 70)
  const sp = t.lastIndexOf(" ", end)
  if (end < t.length && sp > o.at) end = sp
  const text = plain(t.slice(start, end))
  return `${segName(seg)}: «${start > 0 && cut <= 1 ? "…" : ""}${text}${end < t.length ? "…" : ""}»`
}
function renderSide(id) {
  const side = $("#side")
  side.innerHTML = ""
  const e = E.get(id)
  const scope = state.scope
  const g = graph[scope]
  const deps = sortReading(g.deps.get(id) ?? []), users = sortReading(g.users.get(id) ?? [])
  const anc = closure(id, "anc"), desc = closure(id, "desc")
  side.append(h("h3", {}, "Место в системе"))
  side.append(h("div", {class: "facts"},
    h("div", {class: "fact", title: "Длина самой длинной цепочки доказательств до первых начал"}, h("b", {}, depth.get(id)), h("span", {}, "уровень вывода")),
    h("div", {class: "fact", title: "Все положения, на которых держится доказательство"}, h("b", {}, anc.size), h("span", {}, "опирается всего")),
    h("div", {class: "fact", title: "Все положения, доказательства которых держатся на этом"}, h("b", {}, desc.size), h("span", {}, "держится на нём")),
  ))
  side.append(h("div", {class: "controls", style: "margin:14px 0 0"}, h("div", {class: "seg-switch"},
    h("button", {class: scope === "logical" ? "on" : "", type: "button", onclick: () => { state.scope = "logical"; renderSide(id) }}, "в доказательствах"),
    h("button", {class: scope === "all" ? "on" : "", type: "button", onclick: () => { state.scope = "all"; renderSide(id) }}, "включая схолии"))))
  const list = (title, ids, dir) => {
    side.append(h("h3", {}, h("span", {}, title), h("span", {}, ids.length)))
    if (!ids.length) { side.append(h("div", {class: "empty"}, dir === "deps" ? (isPrinciple(e) ? "Первое начало: ни на что не опирается." : "Прямых ссылок нет.") : "Нигде не цитируется.")); return }
    const box = h("div", {})
    for (const x of ids) {
      const t = E.get(x)
      const where = occ.filter((o) => (dir === "deps" ? o.segTop === id && o.toTop === x : o.segTop === x && o.toTop === id) && (scope === "all" || o.logical))
      const ctx = where.slice(0, 2).map(contextOf)
      const exact = [...new Set(where.map((o) => (dir === "deps" ? o.to : o.seg)))].filter((z) => z !== x).map((z) => E.get(z).rid)
      const discursive = where.every((o) => !o.logical)
      box.append(h("a", {class: `dep${discursive ? " discursive" : ""}`, href: `#/text/${x}`, style: `--part:${partVar(t.part)}`},
        h("div", {class: "h"}, h("span", {class: "pdot"}), h("span", {class: "rid"}, t.rid), exact.length ? h("span", {class: "hint"}, exact.join(", ")) : null, h("span", {class: "k"}, `${shortType[t.type] ?? t.type}${where.length > 1 ? ` · ×${where.length}` : ""}`)),
        h("div", {class: "s"}, snippet(t.text, 150)),
        ctx.map((c) => h("div", {class: "c"}, c))))
    }
    side.append(box)
  }
  list("Опирается на", deps, "deps")
  list("Используется в", users, "users")
  side.append(h("p", {class: "hint", style: "margin-top:20px"}, "Курсивом — как именно положение цитируется. Щелчок по ссылке в тексте раскрывает её на месте; с Ctrl или Shift — переходит к ней."))
}

// ---------------------------------------------------------------- search
$("#search").addEventListener("submit", (ev) => {
  ev.preventDefault()
  const q = $("#q").value.trim()
  if (!q) { renderToc(); markToc(state.id); return }
  const id = parseId(q)
  if (id) { go(state.tab === "graph" ? "graph" : "text", id); return }
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
  const hits = D.entries.filter((e) => re.test(plain(e.text)) || (e.la && re.test(e.la)))
  if (state.tab !== "text") go("text")
  renderToc(hits, q)
})

// ---------------------------------------------------------------- tooltip
const tip = $("#tip")
function showTip(ev, html) { tip.innerHTML = html; tip.hidden = false; moveTip(ev) }
function moveTip(ev) {
  const r = tip.getBoundingClientRect()
  let x = ev.clientX + 14, y = ev.clientY + 14
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14
  tip.style.left = `${Math.max(8, x)}px`; tip.style.top = `${Math.max(8, y)}px`
}
const hideTip = () => { tip.hidden = true }
const tipFor = (id, extra = "") => { const e = E.get(id); return `<b>${esc(e.rid)}</b> ${esc(e.label.split(" · ").slice(1).join(" · "))}${extra}<div class="s">${esc(snippet(e.text, 200))}</div>` }

// ---------------------------------------------------------------- statistics & map
const svgNS = "http://www.w3.org/2000/svg"
const s = (tag, attrs = {}, ...kidsList) => { const el = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); for (const c of kidsList.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c))); return el }
const nodes = tops.filter((e) => e.part > 0)
const stat = {}
function computeStats() {
  if (stat.done) return
  const L = graph.logical
  stat.edges = [...L.deps.values()].reduce((n, x) => n + x.size, 0)
  stat.edgesAll = [...graph.all.deps.values()].reduce((n, x) => n + x.size, 0)
  stat.refs = occ.length
  stat.refsLogical = occ.filter((o) => o.logical).length
  stat.props = nodes.filter(isProposition).length
  stat.principles = nodes.filter(isPrinciple)
  stat.unused = stat.principles.filter((e) => !graph.all.users.get(e.id).size)
  stat.unusedLogical = stat.principles.filter((e) => !L.users.get(e.id).size && graph.all.users.get(e.id).size)
  stat.maxDepth = Math.max(...nodes.map((e) => depth.get(e.id)))
  stat.done = true
}
function longestPath(id) {
  const path = [id]
  let cur = id
  while (depth.get(cur) > 0) {
    const next = sortReading(graph.logical.deps.get(cur)).filter((x) => depth.get(x) === depth.get(cur) - 1)[0]
    if (!next) break
    path.push(next); cur = next
  }
  return path.reverse()
}
const ridLink = (id) => h("a", {href: `#/text/${id}`, class: "mono", style: `text-decoration:none;font-weight:600;color:inherit;white-space:nowrap`, onmouseenter: (ev) => showTip(ev, tipFor(id)), onmousemove: moveTip, onmouseleave: hideTip}, h("span", {class: "pdot", style: `display:inline-block;margin-right:5px;vertical-align:1px;--part:${partVar(E.get(id).part)}`}), E.get(id).rid)

function renderGraph() {
  computeStats()
  const page = $("#graph")
  if (page.dataset.built) { renderEgo(); return }
  page.dataset.built = "1"
  page.append(h("h1", {}, "Связи и статистика"))
  page.append(h("p", {class: "lede"}, "Как устроена «Этика» как система доказательств: что на что опирается, какие положения несут на себе больше всего, как части книги зависят друг от друга. Учитываются ссылки в доказательствах, королларииях и формулировках; ссылки в схолиях и объяснениях — это комментарий, их можно включить отдельно."))
  page.append(h("div", {class: "kpis"},
    kpi(fmt(D.entries.length), "мест текста (с доказательствами, схолиями…)"),
    kpi(stat.props, "теорем и лемм"),
    kpi(stat.principles.length, "определений, аксиом, постулатов"),
    kpi(fmt(stat.refs), `ссылок в тексте, из них ${fmt(stat.refsLogical)} в доказательствах`),
    kpi(fmt(stat.edges), "прямых зависимостей между положениями"),
    kpi(stat.maxDepth, "самая длинная цепочка вывода"),
  ))

  // --- map
  page.append(h("h2", {}, "Карта зависимостей"))
  page.append(h("p", {class: "sub-lede"}, "Каждая точка — положение; по горизонтали — порядок в книге, по вертикали — уровень вывода (сверху первые начала, ниже — то, что выводится длиннее). Наведите на точку: синим подсветится всё, на чём она держится, оранжевым — всё, что держится на ней. Щелчок выбирает положение ниже, двойной щелчок открывает текст."))
  const mapWrap = h("div", {class: "map-wrap"})
  page.append(mapWrap)
  page.append(h("div", {class: "legend"}, [1, 2, 3, 4, 5].map((p) => h("span", {}, h("i", {style: `background:${partVar(p)}`}), `Часть ${ROMAN[p]}`)), h("span", {}, h("i", {style: "background:var(--anc)"}), "основания выбранного"), h("span", {}, h("i", {style: "background:var(--desc)"}), "выводы из него"), h("span", {class: "hint"}, "▪ квадрат — определение, аксиома или постулат")))
  drawMap(mapWrap)

  // --- selected theorem
  page.append(h("h2", {id: "ego-h"}, "Выбранное положение"))
  page.append(h("div", {id: "ego"}))
  renderEgo()

  // --- most cited
  page.append(h("h2", {}, "Что несёт на себе больше всего"))
  const top = h("div", {class: "card"})
  page.append(top)
  renderTopCited(top, "direct")

  // --- parts matrix and depth histogram
  page.append(h("h2", {}, "Части книги и глубина вывода"))
  const g2 = h("div", {class: "grid2"})
  page.append(g2)
  g2.append(partsMatrix(), depthHistogram())

  // --- foundations
  page.append(h("h2", {}, "Первые начала"))
  page.append(h("p", {class: "sub-lede"}, "Определения, аксиомы и постулаты: сколько положений опирается на каждое прямо и через цепочку."))
  page.append(foundations())

  // --- longest chains
  page.append(h("h2", {}, "Самые длинные цепочки"))
  page.append(longestChains())

  // --- structure
  page.append(h("h2", {}, "Состав частей"))
  page.append(structureTable())

  // --- research
  page.append(h("h2", {}, "Сравнение с исследованиями"))
  page.append(research())
  page.append(h("p", {class: "hint", style: "margin-top:48px"}, "Ethica Explorer — свободная программа без каких-либо гарантий; её можно распространять и изменять на условиях ", h("a", {href: "https://www.gnu.org/licenses/gpl-3.0.html", target: "_blank", rel: "noopener"}, "GNU GPL версии 3 или более поздней"), ". Исходный код: ", h("a", {href: "https://github.com/liberbook/ethica-explorer", target: "_blank", rel: "noopener"}, "github.com/liberbook/ethica-explorer"), ". Тексты «Этики» — общественное достояние."))
}
const kpi = (v, label) => h("div", {class: "kpi"}, h("b", {}, v), h("span", {}, label))

function drawMap(wrap) {
  const list = nodes.filter((e) => e.type !== "предисловие" && !/прибавление/.test(e.type))
  const avail = Math.max(900, wrap.clientWidth || 1100)
  const gap = 26, top = 26, rowH = 22
  const step = Math.max(1.9, (avail - 60 - 4 * gap) / list.length)
  const maxD = stat.maxDepth
  const xs = new Map()
  let x = 30, lastPart = 0
  const partStart = {}
  for (const e of list) { if (e.part !== lastPart) { x += lastPart ? gap : 0; lastPart = e.part; partStart[e.part] = x } xs.set(e.id, x); x += step }
  const W = x + 30, H = top + (maxD + 1) * rowH + 24
  const dpr = devicePixelRatio || 1
  const cv = h("canvas", {width: W * dpr, height: H * dpr, style: `width:${W}px;height:${H}px`})
  wrap.append(cv)
  const ctx = cv.getContext("2d")
  const yOf = (id) => top + depth.get(id) * rowH
  const css = getComputedStyle(document.documentElement)
  let hover = null
  const pts = list.map((e) => ({id: e.id, x: xs.get(e.id), y: yOf(e.id), e}))
  function paint() {
    const col = (v) => css.getPropertyValue(v).trim()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.font = "11px " + col("--sans")
    ctx.fillStyle = col("--ink-3")
    for (let d = 0; d <= maxD; d += 2) { ctx.fillText(String(d), 6, top + d * rowH + 4) }
    for (const p of [1, 2, 3, 4, 5]) { ctx.fillStyle = col("--ink-2"); ctx.fillText(`Часть ${ROMAN[p]}`, partStart[p], 14) }
    ctx.strokeStyle = col("--line"); ctx.lineWidth = 1
    for (let d = 0; d <= maxD; d++) { ctx.beginPath(); ctx.moveTo(26, top + d * rowH); ctx.lineTo(W - 10, top + d * rowH); ctx.globalAlpha = .45; ctx.stroke(); ctx.globalAlpha = 1 }
    const focus = hover ?? state.graphId
    const anc = focus ? closure(focus, "anc") : new Set(), desc = focus ? closure(focus, "desc") : new Set()
    // edges: only those of the focused chain, to keep the picture readable
    if (focus && xs.has(focus)) {
      ctx.lineWidth = 1
      const drawEdges = (set, color, rel) => {
        ctx.strokeStyle = color; ctx.globalAlpha = hover ? .4 : .22
        for (const a of [...set, focus]) for (const b of rel.get(a) ?? []) if ((set.has(b) || b === focus) && xs.has(a) && xs.has(b)) { ctx.beginPath(); ctx.moveTo(xs.get(a), yOf(a)); ctx.lineTo(xs.get(b), yOf(b)); ctx.stroke() }
        ctx.globalAlpha = 1
      }
      drawEdges(anc, col("--anc"), graph.logical.deps)
      drawEdges(desc, col("--desc"), graph.logical.users)
    }
    for (const p of pts) {
      let color = col(`--p${p.e.part}`), alpha = 1, r = 2.3
      if (focus) {
        if (p.id === focus) { color = col("--ink"); r = 5 }
        else if (anc.has(p.id)) color = col("--anc")
        else if (desc.has(p.id)) color = col("--desc")
        else alpha = .18
      }
      ctx.globalAlpha = alpha; ctx.fillStyle = color
      if (isPrinciple(p.e)) ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2)
      else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill() }
    }
    ctx.globalAlpha = 1
  }
  const pick = (ev) => {
    const b = cv.getBoundingClientRect(), mx = ev.clientX - b.left, my = ev.clientY - b.top
    let best = null, bd = 64
    for (const p of pts) { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = p } }
    return best
  }
  cv.addEventListener("mousemove", (ev) => {
    const p = pick(ev)
    const id = p ? p.id : null
    if (id !== hover) { hover = id; paint() }
    if (p) showTip(ev, tipFor(p.id, `<div class="s" style="font-family:var(--sans)">уровень ${depth.get(p.id)} · опирается на ${closure(p.id, "anc").size} · на нём ${closure(p.id, "desc").size}</div>`)); else hideTip()
  })
  cv.addEventListener("mouseleave", () => { hover = null; hideTip(); paint() })
  cv.addEventListener("click", (ev) => { const p = pick(ev); if (p) { state.graphId = p.id; history.replaceState(null, "", `#/graph/${p.id}`); paint(); renderEgo() } })
  cv.addEventListener("dblclick", (ev) => { const p = pick(ev); if (p) go("text", p.id) })
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint)
  drawMap.repaint = paint
  paint()
}

function renderEgo() {
  const box = $("#ego")
  if (!box) return
  const id = state.graphId
  const e = E.get(id)
  box.innerHTML = ""
  const anc = closure(id, "anc"), desc = closure(id, "desc")
  box.append(h("div", {class: "controls"},
    h("span", {style: "font:600 18px var(--serif)"}, ridLink(id), " ", e.label.split(" · ").slice(1).join(" · ")),
    h("a", {class: "btn", href: `#/text/${id}`}, "Читать"),
    h("form", {onsubmit: (ev) => { ev.preventDefault(); const x = parseId(ev.target.q.value); if (x) { state.graphId = topOf(x); history.replaceState(null, "", `#/graph/${state.graphId}`); renderEgo(); drawMap.repaint?.() } }}, h("input", {name: "q", class: "btn", style: "width:160px", placeholder: "другое: Э4т37"}))))
  box.append(h("p", {class: "sub-lede"}, snippet(e.text, 400)))
  box.append(h("div", {class: "kpis", style: "margin-bottom:12px"}, kpi(depth.get(id), "уровень вывода"), kpi(anc.size, "положений в основании"), kpi(desc.size, "положений держится на нём"), kpi(graph.logical.deps.get(id).size, "прямых ссылок"), kpi(graph.logical.users.get(id).size, "прямо цитируют")))
  box.append(h("div", {class: "card"}, h("h3", {}, "Дерево оснований"), h("p", {class: "note"}, "Слева первые начала, справа выбранное положение; колонки — уровни вывода. Линии — прямые ссылки в доказательствах, синие — те, на которые выбранное ссылается само. Наведите на узел, чтобы увидеть его связи и формулировку; щелчок открывает текст."), egoSvg(id, anc)))
}
function egoSvg(id, anc) {
  const ids = [...anc, id]
  const cols = new Map()
  for (const x of ids) { const d = depth.get(x); (cols.get(d) ?? cols.set(d, []).get(d)).push(x) }
  for (const c of cols.values()) c.sort((a, b) => pos.get(a) - pos.get(b))
  const levels = [...cols.keys()].sort((a, b) => a - b)
  const colW = 92, rowH = 24, padX = 16, padY = 14
  const maxRows = Math.max(...[...cols.values()].map((c) => c.length))
  const W = padX * 2 + levels.length * colW, H = padY * 2 + maxRows * rowH
  const at = new Map()
  levels.forEach((d, i) => { const c = cols.get(d); const off = (maxRows - c.length) * rowH / 2; c.forEach((x, j) => at.set(x, [padX + i * colW, padY + off + j * rowH])) })
  const svg = s("svg", {width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Дерево оснований ${E.get(id).rid}`})
  const gEdges = s("g", {fill: "none", "stroke-width": 1})
  svg.append(gEdges)
  const edgeEls = []
  for (const x of ids) for (const y of graph.logical.deps.get(x) ?? []) if (at.has(y)) {
    const [x1, y1] = at.get(y), [x2, y2] = at.get(x)
    const ax = x1 + 70, bx = x2
    const direct = x === id
    const p = s("path", {d: `M${ax},${y1 + 9} C${ax + 16},${y1 + 9} ${bx - 16},${y2 + 9} ${bx},${y2 + 9}`, stroke: direct ? "var(--anc)" : "var(--line-strong)", "stroke-opacity": direct ? .9 : .35, "data-a": y, "data-b": x, "data-direct": direct ? 1 : null})
    gEdges.append(p); edgeEls.push(p)
  }
  for (const x of ids) {
    const [px, py] = at.get(x), e = E.get(x)
    const g = s("g", {transform: `translate(${px},${py})`, style: "cursor:pointer"})
    g.append(s("rect", {width: 70, height: 18, rx: 5, fill: x === id ? "var(--ink)" : "var(--surface)", stroke: partVarStr(e.part), "stroke-width": isPrinciple(e) ? 2 : 1}))
    g.append(s("text", {x: 35, y: 13, "text-anchor": "middle", style: x === id ? "fill:var(--bg)" : ""}, e.rid))
    g.addEventListener("mouseenter", (ev) => { showTip(ev, tipFor(x, `<div class="s" style="font-family:var(--sans)">уровень ${depth.get(x)}</div>`)); for (const p of edgeEls) { const on = p.dataset.a === x || p.dataset.b === x; p.setAttribute("stroke", on ? "var(--anc)" : "var(--line-strong)"); p.setAttribute("stroke-width", on ? 2 : 1); p.setAttribute("stroke-opacity", on ? 1 : .12) } })
    g.addEventListener("mousemove", moveTip)
    g.addEventListener("mouseleave", () => { hideTip(); for (const p of edgeEls) { const d = p.dataset.direct; p.setAttribute("stroke", d ? "var(--anc)" : "var(--line-strong)"); p.setAttribute("stroke-width", 1); p.setAttribute("stroke-opacity", d ? .9 : .35) } })
    g.addEventListener("click", () => go("text", x))
    svg.append(g)
  }
  levels.forEach((d, i) => svg.append(s("text", {x: padX + i * colW + 35, y: H - 2, "text-anchor": "middle", class: "muted", style: "font:10px var(--sans)"}, d)))
  return h("div", {class: "ego"}, svg)
}
const partVarStr = (p) => (p ? `var(--p${p})` : "var(--ink-3)")

function renderTopCited(card, mode) {
  card.innerHTML = ""
  const measures = {
    direct: {label: "прямые ссылки", note: "Сколько разных положений прямо ссылаются на это в своих доказательствах и королларииях.", f: (id) => graph.logical.users.get(id).size},
    all: {label: "включая схолии", note: "То же, но со ссылками из схолий, объяснений и прибавлений.", f: (id) => graph.all.users.get(id).size},
    trans: {label: "вся цепочка", note: "Сколько положений держится на этом через любую цепочку доказательств.", f: (id) => closure(id, "desc").size},
  }
  const m = measures[mode]
  const rows = nodes.map((e) => ({id: e.id, v: m.f(e.id)})).sort((a, b) => b.v - a.v || pos.get(a.id) - pos.get(b.id)).slice(0, 25)
  card.append(h("div", {class: "controls"}, h("h3", {style: "margin:0;margin-right:auto"}, "25 самых цитируемых положений"), h("div", {class: "seg-switch"}, Object.entries(measures).map(([k, v]) => h("button", {type: "button", class: k === mode ? "on" : "", onclick: () => renderTopCited(card, k)}, v.label)))))
  card.append(h("p", {class: "note"}, m.note))
  const max = rows[0].v, barH = 16, gapY = 6, labelW = 92, W = 1040, valueW = 40
  const H = rows.length * (barH + gapY)
  const svg = s("svg", {viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Самые цитируемые положения"})
  rows.forEach((r, i) => {
    const e = E.get(r.id), y = i * (barH + gapY), w = Math.max(4, (W - labelW - valueW - 260) * r.v / max)
    const g = s("g", {style: "cursor:pointer"})
    g.append(s("rect", {x: 0, y: y - 2, width: W, height: barH + 4, fill: "transparent"}))
    g.append(s("text", {x: 0, y: y + 12, style: "font:600 12px var(--mono);fill:var(--ink)"}, e.rid))
    g.append(s("rect", {x: labelW, y, width: w, height: barH, rx: 4, fill: partVarStr(e.part)}))
    g.append(s("text", {x: labelW + w + 8, y: y + 12, style: "font:600 12px var(--sans);fill:var(--ink)"}, r.v))
    g.append(s("text", {x: labelW + w + 8 + valueW, y: y + 12, class: "muted"}, snippet(e.text, Math.max(10, Math.floor((W - labelW - w - 8 - valueW) / 6.6)))))
    g.addEventListener("mouseenter", (ev) => showTip(ev, tipFor(r.id, ` · ${r.v}`)))
    g.addEventListener("mousemove", moveTip)
    g.addEventListener("mouseleave", hideTip)
    g.addEventListener("click", () => { state.graphId = r.id; history.replaceState(null, "", `#/graph/${r.id}`); renderEgo(); drawMap.repaint?.(); $("#ego-h").scrollIntoView({behavior: "smooth"}) })
    svg.append(g)
  })
  card.append(svg)
  card.append(h("div", {class: "legend"}, [1, 2, 3, 4, 5].map((p) => h("span", {}, h("i", {style: `background:${partVar(p)}`}), `Часть ${ROMAN[p]}`))))
}

function partsMatrix() {
  const M = Array.from({length: 6}, () => new Array(6).fill(0))
  for (const [a, set] of graph.logical.deps) for (const b of set) { const pa = E.get(a).part, pb = E.get(b).part; if (pa && pb) M[pa][pb]++ }
  const max = Math.max(...M.flat())
  const card = h("div", {class: "card"}, h("h3", {}, "Какая часть на какую опирается"), h("p", {class: "note"}, "Число прямых зависимостей: строка — часть, где стоит доказательство, столбец — часть, на положение которой оно ссылается."))
  const cell = 52, off = 80
  const svg = s("svg", {viewBox: `0 0 ${off + cell * 5 + 4} ${30 + cell * 5 + 4}`, width: "100%", style: "max-width:380px", role: "img", "aria-label": "Матрица зависимостей между частями"})
  for (let j = 1; j <= 5; j++) svg.append(s("text", {x: off + (j - 1) * cell + cell / 2, y: 18, "text-anchor": "middle"}, ROMAN[j]))
  const steps = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5"]
  for (let i = 1; i <= 5; i++) {
    svg.append(s("text", {x: off - 10, y: 30 + (i - 1) * cell + cell / 2 + 4, "text-anchor": "end"}, `Часть ${ROMAN[i]}`))
    for (let j = 1; j <= 5; j++) {
      const v = M[i][j], k = v === 0 ? 0 : Math.min(5, 1 + Math.floor(4.999 * Math.sqrt(v / max)))
      const g = s("g")
      g.append(s("rect", {x: off + (j - 1) * cell + 1, y: 30 + (i - 1) * cell + 1, width: cell - 2, height: cell - 2, rx: 6, fill: `var(${steps[k]})`}))
      g.append(s("text", {x: off + (j - 1) * cell + cell / 2, y: 30 + (i - 1) * cell + cell / 2 + 4, "text-anchor": "middle", style: `font:600 12px var(--sans);fill:${k >= 3 ? "#fff" : "var(--ink)"}`}, v || ""))
      g.addEventListener("mouseenter", (ev) => showTip(ev, `Часть ${ROMAN[i]} → часть ${ROMAN[j]}: <b>${v}</b> ${plural(v, "зависимость", "зависимости", "зависимостей")}`))
      g.addEventListener("mousemove", moveTip); g.addEventListener("mouseleave", hideTip)
      svg.append(g)
    }
  }
  card.append(svg)
  return card
}
function depthHistogram() {
  const props = nodes.filter(isProposition)
  const counts = new Array(stat.maxDepth + 1).fill(0)
  for (const e of props) counts[depth.get(e.id)]++
  const card = h("div", {class: "card"}, h("h3", {}, "Сколько шагов от первых начал"), h("p", {class: "note"}, "Число теорем и лемм по уровню вывода: длина самой длинной цепочки доказательств до определений, аксиом и постулатов."))
  const W = 520, H = 220, padL = 30, padB = 26, bw = (W - padL) / counts.length
  const max = Math.max(...counts)
  const svg = s("svg", {viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Распределение теорем по уровню вывода"})
  for (const t of [0, .5, 1]) { const y = (H - padB) * (1 - t) + 4; svg.append(s("line", {x1: padL, x2: W, y1: y, y2: y, class: "axis"})); svg.append(s("text", {x: padL - 6, y: y + 4, "text-anchor": "end", class: "muted"}, Math.round(max * t))) }
  counts.forEach((c, d) => {
    const bh = (H - padB - 4) * c / max, x = padL + d * bw + 1, y = H - padB - bh + 4
    const g = s("g")
    g.append(s("rect", {x, y: 0, width: bw - 2, height: H, fill: "transparent"}))
    if (c) g.append(s("path", {d: roundTop(x, y, bw - 2, bh, Math.min(4, (bw - 2) / 2)), fill: "var(--accent)"}))
    if (d % 2 === 0) g.append(s("text", {x: x + (bw - 2) / 2, y: H - 8, "text-anchor": "middle", class: "muted"}, d))
    g.addEventListener("mouseenter", (ev) => { const ex = props.filter((e) => depth.get(e.id) === d).slice(0, 8).map((e) => e.rid).join(", "); showTip(ev, `Уровень ${d}: <b>${c}</b> ${plural(c, "теорема", "теоремы", "теорем")}<div class="s">${esc(ex)}${c > 8 ? "…" : ""}</div>`) })
    g.addEventListener("mousemove", moveTip); g.addEventListener("mouseleave", hideTip)
    svg.append(g)
  })
  card.append(svg)
  return card
}
const roundTop = (x, y, w, hgt, r) => (hgt < r ? `M${x},${y + hgt}V${y}H${x + w}V${y + hgt}Z` : `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`)

function foundations() {
  const rows = stat.principles.map((e) => ({e, direct: graph.logical.users.get(e.id).size, all: graph.all.users.get(e.id).size, trans: closure(e.id, "desc").size})).sort((a, b) => b.trans - a.trans || b.direct - a.direct)
  const card = h("div", {class: "card"})
  const unused = rows.filter((r) => r.all === 0)
  card.append(h("p", {class: "note"}, `Ни разу не процитированы: ${unused.length} — `, ...unused.flatMap((r, i) => [i ? ", " : "", ridLink(r.e.id)]), ". Только в схолиях или объяснениях, но не в доказательствах: ", ...stat.unusedLogical.flatMap((e, i) => [i ? ", " : "", ridLink(e.id)]), stat.unusedLogical.length ? "." : "нет."))
  const tbl = h("table", {class: "data"}, h("thead", {}, h("tr", {}, h("th", {}, "Положение"), h("th", {}, "Формулировка"), h("th", {class: "num"}, "Прямо"), h("th", {class: "num"}, "Со схолиями"), h("th", {class: "num"}, "Через цепочку"))))
  const tb = h("tbody")
  for (const r of rows) tb.append(h("tr", {}, h("td", {}, ridLink(r.e.id)), h("td", {style: "font-family:var(--serif)"}, snippet(r.e.text, 110)), h("td", {class: "num"}, r.direct), h("td", {class: "num"}, r.all), h("td", {class: "num"}, r.trans)))
  tbl.append(tb)
  card.append(h("div", {class: "scroll"}, tbl))
  return card
}
function longestChains() {
  const props = nodes.filter(isProposition).sort((a, b) => depth.get(b.id) - depth.get(a.id) || pos.get(a.id) - pos.get(b.id)).slice(0, 8)
  const card = h("div", {class: "card"}, h("p", {class: "note"}, "Для каждой из самых «глубоких» теорем — одна из её самых длинных цепочек: каждое звено прямо цитируется в доказательстве следующего."))
  const tbl = h("table", {class: "data"}, h("thead", {}, h("tr", {}, h("th", {}, "Теорема"), h("th", {class: "num"}, "Шагов"), h("th", {}, "Цепочка"))))
  const tb = h("tbody")
  for (const e of props) {
    const path = longestPath(e.id)
    tb.append(h("tr", {}, h("td", {}, ridLink(e.id)), h("td", {class: "num"}, depth.get(e.id)), h("td", {}, h("div", {class: "pathline"}, path.flatMap((x, i) => [i ? h("span", {class: "arrow"}, "→") : null, ridLink(x)])))))
  }
  tbl.append(tb)
  card.append(tbl)
  return card
}
function structureTable() {
  const types = ["определение", "аксиома", "постулат", "теорема", "доказательство", "королларий", "схолия", "лемма", "определение аффекта", "объяснение", "прибавление (глава)"]
  const card = h("div", {class: "card"})
  const tbl = h("table", {class: "data"}, h("thead", {}, h("tr", {}, h("th", {}, "Часть"), types.map((t) => h("th", {class: "num"}, shortType[t] ?? t)), h("th", {class: "num"}, "Ссылок"))))
  const tb = h("tbody")
  for (let p = 1; p <= 5; p++) {
    const inPart = D.entries.filter((e) => e.part === p)
    tb.append(h("tr", {}, h("td", {}, h("span", {class: "pdot", style: `display:inline-block;margin-right:6px;--part:${partVar(p)}`}), `${ROMAN[p]} · ${PART_NAMES[p]}`), types.map((t) => h("td", {class: "num"}, inPart.filter((e) => e.type === t).length || "")), h("td", {class: "num"}, occ.filter((o) => E.get(o.seg).part === p).length)))
  }
  tbl.append(tb)
  card.append(tbl)
  return card
}
function research() {
  const direct = nodes.map((e) => [e.id, graph.all.users.get(e.id).size]).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const card = h("div", {class: "card"})
  card.append(h("p", {class: "note"}, "Независимые разметки ссылок «Этики» сходятся в главном: больше всего на себе несут схолия к Э3т11 (определения удовольствия и неудовольствия), Э3т7 (стремление — сущность вещи), Э3т3, схолия к Э3т13 (любовь и ненависть), Э1т15, кор. Э2т11. Здесь (со схолиями): ", ...direct.flatMap(([id, v], i) => [i ? ", " : "", ridLink(id), ` ${v}`]), "."))
  const tbl = h("table", {class: "data"}, h("thead", {}, h("tr", {}, h("th", {}, "Источник"), h("th", {}, "Что посчитано"), h("th", {}, "Числа"))))
  const tb = h("tbody")
  const row = (a, b, c) => tb.append(h("tr", {}, h("td", {}, a), h("td", {}, b), h("td", {}, c)))
  row("Эта страница", "все места текста; ссылки в доказательствах и схолиях", `${D.entries.length} мест, ${stat.refs} ссылок, ${stat.edges} прямых зависимостей между ${nodes.length} положениями`)
  row(h("a", {href: "https://capone.mtsu.edu/rbombard/RB/Spinoza/", target: "_blank", rel: "noopener"}, "R. F. Tredwell, «Acyclic Directed Graph of Spinoza's Ethics»"), "только пронумерованные положения, только явные ссылки", "430 узлов, 1035 рёбер; 42 неиспользованных начала; у Э5т34 69 предков")
  row(h("a", {href: "https://digital.spinozism.org", target: "_blank", rel: "noopener"}, "T. Doppelt, «Spinoza's Ethics 2.0»"), "ссылки с точностью до схолий и королларий (по Curley, с латынью и NS)", "1427 ссылок; чаще всего: Э3т11сх 27, Э3т7 24, Э3т3 22, Э3т13сх 22, Э1т15 18")
  row(h("a", {href: "http://baptiste.meles.free.fr/philosophie/spinoza/ethica/", target: "_blank", rel: "noopener"}, "B. Mélès, SpinozaBase"), "латинский текст с размеченными «patet ex»", "1605 ссылок; Э3т11сх цитируется 40 раз; чаще всего определения Э1опр6 и Э3опр2")
  row(h("a", {href: "https://www.ethicaweb.nl", target: "_blank", rel: "noopener"}, "B. Hamminga, EthicaWeb"), "геометрический отчёт", "не используются: Э1акс2, Э2пост2, Э3пост2, Э5акс2 и аксиома 2 о телах; не используются 17 определений аффектов")
  tbl.append(tb)
  card.append(tbl)
  card.append(h("p", {class: "note", style: "margin-top:12px"}, "Числа расходятся из-за разных правил: что считать узлом (схолии, королларии), учитывать ли ссылки «доказывается так же, как предыдущая», какое издание взято за основу. Здесь — русский текст Иванцова, сверенный с латынью 1677 года; спорные места перечислены на скрытой странице сверки (адрес …ethica.html#/audit)."))
  return card
}

// ---------------------------------------------------------------- audit
function renderAudit() {
  const page = $("#audit")
  if (page.dataset.built) return
  page.dataset.built = "1"
  computeStats()
  const A = D.audit
  page.append(h("h1", {}, "Сверка ссылок"))
  page.append(h("p", {class: "lede"}, `Каждая ссылка Спинозы в тексте («по т. 7», «кор. 2 т. 20, ч. I», «сх. пред. т.», «6 опр. аффектов», «в Прибавлении к первой части»…) распознана и превращена в переход. Нераспознанных: ${A.issues.length}. Ниже — что пришлось поправить в источнике, что восполнить и где русский текст и латынь всё ещё расходятся.`))
  page.append(h("div", {class: "kpis"}, kpi(fmt(stat.refs), "распознанных ссылок"), kpi(A.issues.length, "нераспознанных"), kpi(A.fixes.length, "исправлений опечаток и пропущенных ссылок"), kpi(A.gaps.length, "мест восполнено по Модестову"), kpi(A.crossCheck.filter((c) => c.latinOnly.length).length, "мест, где латынь цитирует то, чего нет в переводе")))
  page.append(h("h2", {}, "Источники"))
  page.append(h("ul", {class: "sources"}, Object.values(D.sources).map((t) => h("li", {}, t))))

  const tableOf = (cols, rows) => { const t = h("table", {class: "data"}, h("thead", {}, h("tr", {}, cols.map((c) => h("th", {}, c))))); const b = h("tbody"); for (const r of rows) b.append(h("tr", {}, r.map((c) => h("td", {}, c)))); t.append(b); return h("div", {class: "card scroll"}, t) }
  page.append(h("h2", {}, "Исправлено в тексте издания"))
  page.append(h("p", {class: "sub-lede"}, "Опечатки в номерах, пропущенные в переводе ссылки и формы, которые иначе не распознать. Каждое исправление сверено с латинским текстом."))
  page.append(tableOf(["Место", "Было", "Стало", "Почему"], A.fixes.map((f) => [ridLink(f.id), h("span", {style: "font-family:var(--serif)"}, f.from), h("span", {style: "font-family:var(--serif)"}, f.to), h("span", {class: "hint"}, f.why)])))
  page.append(h("h2", {}, "Восполнено по переводу Модестова"))
  page.append(h("p", {class: "sub-lede"}, "В издании Иванцова, с которого взят текст, часть мест сокращена (‹…›) или отсутствует. Они даны по переводу В. И. Модестова (1886) и выделены в тексте цветом."))
  const modeName = {ellipsis: "восполнен пропуск", "drop-ellipsis": "лишний знак пропуска", replace: "заменено", new: "добавлено"}
  page.append(tableOf(["Место", "Что сделано", "Почему"], A.gaps.map((g) => [ridLink(g.id), modeName[g.mode], h("span", {class: "hint"}, g.why)])))
  page.append(h("h2", {}, "Расхождения с латынью"))
  page.append(h("p", {class: "sub-lede"}, "Ссылки каждого места сравнены со ссылками латинского текста. «Только в латыни» — то, что латынь цитирует, а перевод нет (часто это ошибки автоматического разбора латыни: части, названные словами, аксиомы о телах). «Только в переводе» — чаще всего «пред. т.» и «той же т.», которые латинский разбор не раскрывает."))
  const cc = A.crossCheck.filter((c) => c.latinOnly.length)
  page.append(tableOf(["Место", "Только в латыни", "Только в переводе"], cc.map((c) => [ridLink(c.id), h("span", {}, c.latinOnly.map((x) => E.has(x) ? E.get(x).rid : x).join(", ")), h("span", {class: "hint"}, c.russianOnly.map((x) => E.has(x) ? E.get(x).rid : x).join(", "))])))
  const ro = A.crossCheck.filter((c) => !c.latinOnly.length)
  page.append(h("p", {class: "hint", style: "margin-top:8px"}, `Ещё ${ro.length} мест: в переводе раскрыта ссылка, которую латинский разбор не нашёл (как правило, «по пред. т.»).`))

  if (cycles.length) page.append(h("p", {class: "hint"}, `Циклы в доказательствах: ${cycles.map((c) => c.map((x) => E.get(x).rid).join(" → ")).join("; ")}`))
  const C = A.corpus
  if (!C) return
  page.append(h("h2", {}, "Сравнение с другой разметкой текста"))
  page.append(h("p", {class: "sub-lede"}, `Корпус, переданный при сборке (--corpus). В нём ${C.refDiffs.length} мест, где разметка ссылок отличается от этой: «лишнее в корпусе» — ссылки, которые там указаны неверно (например, «пред. т.» в королларии указывает не на ту теорему, «ч. I» прочитано как ч. II); «не распознано в корпусе» — ссылки, которых там нет вовсе. Кроме того, в корпусе ${C.truncated.length} мест с пропуском ‹…›, ${C.emptyEntries.length} пустых (${C.emptyEntries.join(", ")}) и не хватает ${C.missingEntries.length} мест (${C.missingEntries.join(", ")}).`))
  page.append(tableOf(["Место", "Лишнее в корпусе", "Не распознано в корпусе"], C.refDiffs.map((c) => [ridLink(c.id), h("span", {}, c.corpusOnly.map((x) => E.has(x) ? E.get(x).rid : x).join(", ")), h("span", {}, c.missingInCorpus.map((x) => E.get(x).rid).join(", "))])))
}

// ---------------------------------------------------------------- theme & start
const themeBtn = $("#theme")
try { const t = localStorage.getItem("ethica.theme"); if (t) document.documentElement.dataset.theme = t } catch {}
themeBtn.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  document.documentElement.dataset.theme = dark ? "light" : "dark"
  try { localStorage.setItem("ethica.theme", document.documentElement.dataset.theme) } catch {}
  drawMap.repaint?.()
})
renderToc()
if (!location.hash) history.replaceState(null, "", "#/text/1d1")
route()
window.__ethica = {E, graph, depth, closure, occ, cycles, stat, computeStats, currentBookId, renderReader}
})()
