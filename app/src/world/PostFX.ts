import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import {
  chromaticFragment,
  vignetteGrainFragment,
  vignetteVertex,
} from './shaders'
import type { QualityTier } from '../utils/quality'

/** Restrained cinematic post — premium, never blown-out. */
export class PostFX {
  readonly composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private vignette: ShaderPass | null = null
  private chroma: ShaderPass | null = null
  private readonly baseChroma: number
  private readonly baseBloom: number
  private useComposer: boolean
  private bloomMul = 1

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    tier: QualityTier,
  ) {
    // Skip EffectComposer/bloom on low tier and WebKit — WPE/Playwright (and some
    // iOS GPUs) can hard-crash on UnrealBloomPass framebuffer setup.
    const isWebKit =
      typeof navigator !== 'undefined' &&
      /AppleWebKit/i.test(navigator.userAgent) &&
      !/Chrome|Chromium|Edg|Android/i.test(navigator.userAgent)
    this.useComposer = tier !== 'low' && !isWebKit
    this.baseBloom = tier === 'high' ? 0.12 : 0.07
    this.baseChroma = tier === 'high' ? 0.0004 : 0.00022

    if (!this.useComposer) return

    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.baseBloom,
      0.4,
      0.92,
    )
    this.composer.addPass(this.bloom)

    this.chroma = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uAmount: { value: this.baseChroma },
      },
      vertexShader: vignetteVertex,
      fragmentShader: chromaticFragment,
    })
    this.composer.addPass(this.chroma)

    this.vignette = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uGrain: { value: tier === 'high' ? 0.004 : 0.002 },
      },
      vertexShader: vignetteVertex,
      fragmentShader: vignetteGrainFragment,
    })
    this.composer.addPass(this.vignette)
  }

  setMotionAmount(amount: number): void {
    if (!this.chroma) return
    this.chroma.uniforms.uAmount.value = this.baseChroma + Math.min(1, amount) * 0.00035
  }

  /** 0 = no bloom (finale), 1 = normal chapter bloom */
  setBloomMul(mul: number): void {
    this.bloomMul = THREE.MathUtils.clamp(mul, 0, 1)
    if (this.bloom) this.bloom.strength = this.baseBloom * this.bloomMul
  }

  setSize(w: number, h: number): void {
    this.composer?.setSize(w, h)
    this.bloom?.setSize(w, h)
  }

  setPixelRatio(ratio: number): void {
    this.composer?.setPixelRatio(ratio)
  }

  render(time: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.useComposer || !this.composer) {
      renderer.render(scene, camera)
      return
    }
    if (this.vignette) this.vignette.uniforms.uTime.value = time
    this.composer.render()
  }

  dispose(): void {
    this.composer?.dispose()
  }
}
