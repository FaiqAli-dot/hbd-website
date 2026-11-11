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
  readonly composer: EffectComposer
  private bloom: UnrealBloomPass
  private vignette: ShaderPass
  private chroma: ShaderPass
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
    this.useComposer = tier !== 'low'
    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, camera))

    // High threshold so only the brightest accents bloom; low strength clamps washout
    this.baseBloom = tier === 'high' ? 0.12 : 0.07
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.baseBloom,
      0.4,
      0.92,
    )
    this.composer.addPass(this.bloom)

    this.baseChroma = tier === 'high' ? 0.0004 : 0.00022
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
        uIntensity: { value: 0.48 },
        uTime: { value: 0 },
        uGrain: { value: tier === 'high' ? 0.016 : 0.011 },
      },
      vertexShader: vignetteVertex,
      fragmentShader: vignetteGrainFragment,
    })
    this.composer.addPass(this.vignette)

    if (!this.useComposer) {
      this.bloom.strength = 0.04
      this.chroma.uniforms.uAmount.value = 0.00012
      this.vignette.uniforms.uGrain.value = 0.008
    }
  }

  setMotionAmount(amount: number): void {
    this.chroma.uniforms.uAmount.value = this.baseChroma + Math.min(1, amount) * 0.00035
  }

  /** 0 = no bloom (finale), 1 = normal chapter bloom */
  setBloomMul(mul: number): void {
    this.bloomMul = THREE.MathUtils.clamp(mul, 0, 1)
    this.bloom.strength = this.baseBloom * this.bloomMul
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
  }

  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio)
  }

  render(time: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.useComposer) {
      renderer.render(scene, camera)
      return
    }
    this.vignette.uniforms.uTime.value = time
    this.composer.render()
  }

  dispose(): void {
    this.composer.dispose()
  }
}
