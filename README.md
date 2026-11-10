# Happy Birthday — Interactive Website

An immersive, cinematic birthday experience with gesture-driven photography, an editorial love letter, hover/tap memory videos, and a drawn **HAPPY BIRTHDAY** finale.

**Live URL (after Pages is enabled):** https://faiqali-dot.github.io/hbd-website/

## Stack

- Vite + TypeScript
- GSAP + ScrollTrigger
- Custom Pointer Events for swipe gestures
- Web Audio via HTMLAudioElement (optional, never autoplays)

**Visual direction:** nocturne film letter — deep espresso charcoal, champagne gold, soft blush, expressive Syne + Newsreader typography, atmospheric grain.

## Replace content (no component edits)

All swapable copy and asset paths live in:

- [`src/content/config.ts`](src/content/config.ts)

Asset folders:

- `src/assets/images/gallery/` — gesture gallery photos
- `src/assets/images/circles/` — floating letter circles
- `src/assets/videos/memories/` — four circular videos
- `src/assets/audio/` — ambient + interaction cues

Placeholder media is committed (Unsplash stills; Ken Burns clips; soft generated audio). Replace files and update imports in the config.

## Local development

```bash
npm install
npm run dev
```

Production build (base path `/hbd-website/`):

```bash
npm run build
npm run preview
```

## GitHub Pages

Workflow: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

Triggers on push to `main` and `workflow_dispatch`.

**Owner setting required:** Repository **Settings → Pages → Source: GitHub Actions**.

## Experience notes

1. **Gallery** — swipe (or arrow keys) in the direction the illustrated hand shows. Scrolling is locked until every photo is revealed. Progress reads `03 / 08`. **Go back** undoes the last reveal.
2. **Letter** — editorial paragraph with floating circular photos.
3. **Memories** — four circular videos; hover to play on desktop, tap to toggle on mobile.
4. **Finale** — SVG stroke-draw + letter choreography for HAPPY BIRTHDAY.

Sound starts only when the visitor presses **Sound off → Sound on**.
