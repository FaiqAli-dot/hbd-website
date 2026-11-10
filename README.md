# Happy Birthday — Interactive Website

An immersive, cinematic birthday experience with gesture-driven photography, an editorial love letter, circular memory videos, and a drawn **HAPPY BIRTHDAY** finale.

**Live URL:** https://faiqali-dot.github.io/hbd-website/

## How GitHub Pages is set up for this repo

Pages is configured as:

**Settings → Pages → Deploy from a branch → Branch: `main` → Folder: `/ (root)`**

That means GitHub serves the **repository root as static files** (no build step). The Vite source therefore lives under [`app/`](app/), and the **built site** (`index.html`, `assets/`, `favicon.svg`, `.nojekyll`) is committed at the repo root.

## Stack

- Vite + TypeScript (in `app/`)
- GSAP + ScrollTrigger
- Optional sound (never autoplays)

**Visual direction:** nocturne film letter — deep espresso charcoal, champagne gold, soft blush.

## Replace content (no component edits)

Edit:

- [`app/src/content/config.ts`](app/src/content/config.ts)

Asset folders:

- `app/src/assets/images/gallery/`
- `app/src/assets/images/circles/`
- `app/src/assets/videos/memories/`
- `app/src/assets/audio/`

Then republish the root site:

```bash
cd app
npm install
npm run build:site
```

Commit the updated root `index.html` + `assets/` (and `.nojekyll`).  
Or push changes under `app/` to `main` and let [`.github/workflows/publish-site.yml`](.github/workflows/publish-site.yml) rebuild and commit the root files.

## Local development

```bash
cd app
npm install
npm run dev
```

## Verify the Pages layout locally

Serves the **repo root** under `/hbd-website/` exactly like project Pages:

```bash
cd app
npm run build:site
npm run serve:pages
# open http://127.0.0.1:4173/hbd-website/
```

## Experience notes

1. **Gallery** — swipe (or arrow keys) with the illustrated hand. Scrolling stays locked until every photo is revealed. **Go back** undoes the last reveal.
2. **Letter** — editorial paragraph with floating circular photos.
3. **Memories** — four circular videos; hover on desktop, tap on mobile.
4. **Finale** — drawn HAPPY BIRTHDAY typography.
