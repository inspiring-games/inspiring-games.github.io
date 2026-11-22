# Bible Gems – Chronological Bible Reading Plan

A static site (HTML, CSS, vanilla JS) for **biblegems.online**. Three pages, one reading plan at three speeds:

| Page | Plan | Items |
|---|---|---|
| `index.html` | 1 year | 365 (the original PDF readings) |
| `two-years.html` | 2 years | 730 (each day split in two by verse count) |
| `three-years.html` | 3 years | 1095 (each day split in three by verse count) |

Every item has a checkbox and links to a search on the Watchtower ONLINE LIBRARY (WOL) in the chosen language. Dates are not displayed.

## Languages
A selector at the top switches the language. It translates the Bible book names and the page text, and links go to that language's WOL (`/en/wol/l/r1/lp-e`, `/ro/wol/l/r34/lp-m`, `/sv/wol/l/r14/lp-z`). The choice is remembered, and `?lang=ro` in the address selects a language directly. Book names are taken from each language's Bible index on WOL.

In English, the 1-year page shows the PDF's exact wording (e.g. `Ge.10:21 - 11:26`). All other pages and languages show full book names.

**Adding a language:** in `data/bible.json`, copy one entry under `langs`, then change the label, the `wol` base URL (from the language's WOL address), the 66 book names (same order as English) and the `ui` texts.

## Files
- `index.html`, `two-years.html`, `three-years.html`, `assets/styles.css`, `assets/app.js` – the site
- `data/plan-1.json`, `plan-2.json`, `plan-3.json` – readings as `[book, firstVerse, lastVerse]` ranges (verse numbers count from the start of each book)
- `data/bible.json` – chapter/verse counts, book names and page texts per language
- `CNAME` – contains `biblegems.online`

## How the 2- and 3-year plans were made
Each day of the 1-year plan is cut into two or three parts with a similar number of verses. A cut moves to the nearest chapter or reference boundary when one is close, otherwise it falls between verses. Chapter and verse counts follow the common (KJV-style) numbering. The smallest parts are about 9 verses (3-year) and 12 verses (2-year).

## Progress is stored locally
Checkbox progress is saved in your browser's `localStorage`. There is no account or server. Progress does **not** sync between devices or browsers, and clearing site data erases it. Each plan has its own progress, so ticking items on the 2-year page does not tick them on the 1-year page.

## Publish on GitHub Pages
1. **Create a repository:** on github.com choose New repository, name it (e.g. `biblegems`), set it Public, and create it.
2. **Upload files:** unzip the archive, then in the repository choose Add file → Upload files and drag in the *contents* of the `biblegems` folder (`index.html`, `readings.json`, `CNAME`, `README.md`, `assets/`). Commit to `main`.
3. **Enable Pages:** Settings → Pages → Build and deployment → Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)` → Save.
4. **Custom domain:** in Settings → Pages → Custom domain enter `biblegems.online` and Save (the `CNAME` file already contains it).
5. **DNS** (at your domain registrar):
   - Four `A` records for the apex (`@`): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Optional `AAAA` records for `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - Optional `CNAME` record: host `www` → `<your-github-username>.github.io`
   - Remove any conflicting old `A`/`AAAA`/`CNAME` records. DNS changes can take up to 24 hours.
6. **HTTPS:** once GitHub's DNS check passes, tick **Enforce HTTPS** in Settings → Pages. The certificate may take a few minutes to an hour.

## Local preview
`python3 -m http.server` in this folder, then open http://localhost:8000 (opening `index.html` directly will not load the JSON in most browsers).
