declare const STROKES: {
  words: string[]
  bbox: number[]
  wordWidth: number[]
  /** True glyph outlines from the OFL script font (one compound path per word). */
  wordOutlines?: string[]
  /** Per-character Great Vibes outlines (preferred reveal target). */
  glyphOutlines?: string[]
  glyphMeta?: Array<{ ch: string; word: number; x0: number; x1: number }>
  /** shared-glyph-mask | shared-word-mask */
  reveal?: string
  font?: string
  license?: string
  strokes: Array<{
    word: number
    kind: string
    center: string
    outline: string
    len: number
    start: number[]
    end: number[]
    wmax: number
    glyph?: number
  }>
}

export default STROKES
