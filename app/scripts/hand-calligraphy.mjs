/**
 * Capitals + lowercase derived from Great Vibes (OFL) via skeleton centers
 * + true glyph outlines. Prefer: npm run derive:calligraphy
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'derive-script-strokes.py')
const r = spawnSync('python3', [script], { stdio: 'inherit' })
process.exit(r.status ?? 1)
