# Bible Gems – Chronological Bible Reading Plan

A static site (HTML, CSS, vanilla JS) for **biblegems.online**: 365 daily readings in chronological order, each with a checkbox and a link to a search on the Watchtower ONLINE LIBRARY (WOL). Dates are not displayed.

## Files
- `index.html`, `assets/styles.css`, `assets/app.js` – the site
- `readings.json` – array of exactly 365 reading strings, extracted from the source PDF
- `CNAME` – contains `biblegems.online`

## Progress is stored locally
Checkbox progress is saved in your browser's `localStorage`. There is no account or server. Progress does **not** sync between devices or browsers, and clearing site data erases it.

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
