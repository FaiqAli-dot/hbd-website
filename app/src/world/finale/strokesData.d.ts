declare const STROKES: {
  words: string[]
  bbox: number[]
  wordWidth: number[]
  strokes: Array<{
    word: number
    kind: string
    center: string
    outline: string
    len: number
    start: number[]
    end: number[]
    wmax: number
  }>
}

export default STROKES
