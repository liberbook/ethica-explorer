# Development

Node.js 22 or newer, no dependencies.

```bash
node tools/build.js                  # writes ethica.html and data/ethica.json
node tools/build.js --check          # audit only; exits 1 when a reference is unresolved
node tools/build.js --out _site      # writes _site/index.html (what GitHub Pages serves)
node tools/build.js --corpus <file>  # also compares another annotated copy of the text
node tools/build.js --export-corpus <file>  # writes the corpus in the format of the spinoza bot
```

The [spinoza bot](https://github.com/liberbook/simplex-bot-for-philosophy-circle) for SimpleX Chat
answers `/ethics` from this text: its `data/spinoza_ethica_index_ru.json` is the `--export-corpus` output.

`npm run build` and `npm run check` do the same. The workflow
`.github/workflows/pages.yml` checks every reference and publishes the page to GitHub Pages on each
push to `main`.

## Pipeline

Russian text -> structure -> passages the edition lacks -> corrections -> references -> Latin
cross-check -> one self-contained page.

| File | Responsibility |
|------|----------------|
| `source/ethica_ru_ivantsov.txt` | the Russian text (N. A. Ivantsov), one paragraph per line, `## ` headings, translator's notes 24-28 |
| `source/gaps-modestov.json` | passages the Ivantsov edition cuts (‹…›) or lacks, from V. I. Modestov's translation (1886) |
| `source/ethica_la.json` | the Latin text (la.wikisource.org), segmented with the same ids |
| `tools/parse-ru.js` | text -> entries (`1p7`, `1p7dem`, `1p8s2`, `2physax3`, `3aff6`, `4app5`) |
| `tools/source-fixes.json` | misprints and citations the edition drops, each checked against the Latin |
| `tools/annotate.js` | recognises the references and writes the identifier after each (`по т. 7 [Э1т7]`) |
| `tools/latin-refs.js` | the references of the Latin text, used only for the cross-check |
| `tools/ids.js` | id forms: `1p6c1` <-> `Э1т6кор1`, the "Часть I · Теорема 6 · Королларий 1" label |
| `tools/build.js` | the pipeline and the audit; inlines `app/` and the data into the page |
| `app/index.html`, `app/app.css`, `app/app.js` | the page: reader, book, statistics and map, audit |

## Rules

- The dependency graph counts references made in statements, demonstrations and corollaries.
  References in scholia, explanations, prefaces and appendices are commentary; the page can
  include them on request. Prefaces and appendix chapters are never premises.
- Every correction of the source text goes into `tools/source-fixes.json` with the reason and the
  Latin reading. The source text itself stays as published.
- Text borrowed from Modestov is wrapped in `⟦ ⟧` and shown highlighted.
- The audit page (`#/audit`) is not in the menu. It lists every correction, every restored passage
  and the remaining disagreements with the Latin.

## Cross-checks

Published dependency datasets were used only to check this annotation and are not included:
R. F. Tredwell's acyclic graph (MTSU), T. Doppelt's *Spinoza's Ethics 2.0*, B. Mélès's SpinozaBase,
B. Hamminga's EthicaWeb.
