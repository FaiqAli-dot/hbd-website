# Happy Birthday — Immersive Three.js Experience

A cinematic WebGL birthday letter: one coordinated Three.js world with custom shaders, post-processing, GSAP/ScrollTrigger camera travel, gesture-driven photographic memory space, floating video portals, and a particle-formed **HAPPY BIRTHDAY** finale.

**Live URL:** https://faiqali-dot.github.io/hbd-website/

## GitHub Pages (branch root)

**Settings → Pages → Deploy from a branch → `main` → `/ (root)`**

Source lives in [`app/`](app/). Built static files (`index.html`, `assets/`, `favicon.svg`, `.nojekyll`) are committed at the repo root. Republish with:

```bash
cd app && npm install && npm run build:site
```

Or push `app/**` changes to `main` and let [`.github/workflows/publish-site.yml`](.github/workflows/publish-site.yml) rebuild the root.

## Stack & architecture

- **Three.js** — single full-screen renderer (not decorative)
- Custom **GLSL** photo reveals, atmosphere, circular masks, soft particles
- **Post-processing** — bloom + vignette/grain (scaled by device tier)
- **GSAP + ScrollTrigger** — gesture timelines + chapter camera path
- HTML overlays for readable letter/UI only
- Quality tiers + `prefers-reduced-motion` + non-WebGL fallback

**Visual direction:** Nocturne Memory Chamber — deep espresso void, champagne/rose-gold emissive light, translucent glass photo planes, atmospheric dust.

Scene groups sit along Z; after the gallery unlocks, scroll scrubs the camera through letter → memory portals → finale.

## Swap content

[`app/src/content/config.ts`](app/src/content/config.ts)

- `app/src/assets/images/gallery/`
- `app/src/assets/images/circles/`
- `app/src/assets/videos/memories/`
- `app/src/assets/audio/`

## Local

```bash
cd app
npm install
npm run dev
# Pages-like check:
npm run build:site && npm run serve:pages
# http://127.0.0.1:4173/hbd-website/
```
