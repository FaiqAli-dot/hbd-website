import { audioAssets } from '../content/config'

type SoundKey = keyof typeof audioAssets

/**
 * Web Audio API manager — never autoplays.
 * Decodes buffers once; resumes AudioContext on explicit user toggle.
 */
class SoundManager {
  private enabled = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ambientSource: AudioBufferSourceNode | null = null
  private buffers = new Map<SoundKey, AudioBuffer>()
  private loading = new Map<SoundKey, Promise<AudioBuffer>>()

  isEnabled(): boolean {
    return this.enabled
  }

  async toggle(): Promise<boolean> {
    this.enabled = !this.enabled
    if (this.enabled) {
      await this.ensureContext()
      await this.playAmbient()
    } else {
      this.stopAmbient()
    }
    return this.enabled
  }

  private async ensureContext(): Promise<void> {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  private async load(key: SoundKey): Promise<AudioBuffer> {
    const existing = this.buffers.get(key)
    if (existing) return existing
    const pending = this.loading.get(key)
    if (pending) return pending
    const job = (async () => {
      await this.ensureContext()
      const res = await fetch(audioAssets[key])
      const raw = await res.arrayBuffer()
      const buf = await this.ctx!.decodeAudioData(raw.slice(0))
      this.buffers.set(key, buf)
      this.loading.delete(key)
      return buf
    })()
    this.loading.set(key, job)
    return job
  }

  private async playAmbient(): Promise<void> {
    if (!this.enabled || !this.ctx || !this.master) return
    this.stopAmbient()
    try {
      const buf = await this.load('ambient')
      if (!this.enabled || !this.ctx || !this.master) return
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = this.ctx.createGain()
      gain.gain.value = 0.28
      src.connect(gain)
      gain.connect(this.master)
      src.start(0)
      this.ambientSource = src
    } catch {
      /* ignore decode failures */
    }
  }

  private stopAmbient(): void {
    try {
      this.ambientSource?.stop()
    } catch {
      /* already stopped */
    }
    this.ambientSource = null
  }

  play(key: SoundKey, volume = 0.45): void {
    if (!this.enabled || !this.ctx || !this.master) return
    void this.load(key)
      .then((buf) => {
        if (!this.enabled || !this.ctx || !this.master) return
        const src = this.ctx.createBufferSource()
        src.buffer = buf
        const gain = this.ctx.createGain()
        gain.gain.value = volume
        src.connect(gain)
        gain.connect(this.master!)
        src.start(0)
      })
      .catch(() => undefined)
  }
}

export const sound = new SoundManager()
