import { audioAssets } from '../content/config'

type SoundKey = keyof typeof audioAssets

class SoundManager {
  private enabled = false
  private ambient: HTMLAudioElement | null = null
  private unlocked = false
  private cache = new Map<SoundKey, HTMLAudioElement>()

  isEnabled(): boolean {
    return this.enabled
  }

  async toggle(): Promise<boolean> {
    this.enabled = !this.enabled
    if (this.enabled) {
      await this.unlock()
      this.playAmbient()
    } else {
      this.stopAmbient()
    }
    return this.enabled
  }

  private async unlock(): Promise<void> {
    if (this.unlocked) return
    this.unlocked = true
    // Warm a silent play/pause cycle if needed by creating ambient early
    this.ambient = new Audio(audioAssets.ambient)
    this.ambient.loop = true
    this.ambient.volume = 0.28
  }

  private playAmbient(): void {
    if (!this.enabled || !this.ambient) return
    void this.ambient.play().catch(() => {
      /* autoplay blocked until next user gesture */
    })
  }

  private stopAmbient(): void {
    if (!this.ambient) return
    this.ambient.pause()
    this.ambient.currentTime = 0
  }

  play(key: SoundKey, volume = 0.45): void {
    if (!this.enabled) return
    let audio = this.cache.get(key)
    if (!audio) {
      audio = new Audio(audioAssets[key])
      this.cache.set(key, audio)
    }
    audio.volume = volume
    audio.currentTime = 0
    void audio.play().catch(() => undefined)
  }
}

export const sound = new SoundManager()
