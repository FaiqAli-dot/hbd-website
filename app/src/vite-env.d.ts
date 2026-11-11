/// <reference types="vite/client" />

declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}
declare module '*.mp4' {
  const src: string
  export default src
}
declare module '*.mp3' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}

declare module './strokesData.js' {
  const STROKES: {
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
}

declare module '*.json' {
  const value: unknown
  export default value
}
