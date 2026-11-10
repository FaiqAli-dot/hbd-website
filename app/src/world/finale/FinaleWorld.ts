import * as THREE from 'three'
import gsap from 'gsap'
import { finaleCopy } from '../../content/config'
import {
  softParticleFragment,
  softParticleVertex,
} from '../shaders'
import { particleBudget, type QualityTier } from '../../utils/quality'
import { prefersReducedMotion } from '../../utils/motion'
import { sound } from '../../components/sound'

function makeLetterTexture(ch: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 256, 256)
  ctx.fillStyle = '#f3e6d2'
  ctx.font = 'bold 180px Syne, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ch, 128, 140)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function sampleLetterPoints(
  ch: string,
  target: THREE.Vector3,
  out: THREE.Vector3[],
  budget: number,
): void {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 64, 64)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 52px Syne, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ch, 32, 36)
  const data = ctx.getImageData(0, 0, 64, 64).data
  const hits: Array<[number, number]> = []
  for (let y = 0; y < 64; y += 2) {
    for (let x = 0; x < 64; x += 2) {
      if (data[(y * 64 + x) * 4 + 3] > 40) hits.push([x, y])
    }
  }
  if (hits.length === 0) {
    for (let i = 0; i < budget; i++) {
      out.push(
        new THREE.Vector3(
          target.x + (Math.random() - 0.5) * 0.35,
          target.y + (Math.random() - 0.5) * 0.35,
          target.z + (Math.random() - 0.5) * 0.1,
        ),
      )
    }
    return
  }
  for (let i = 0; i < budget; i++) {
    const [x, y] = hits[i % hits.length]
    out.push(
      new THREE.Vector3(
        target.x + (x / 64 - 0.5) * 0.7,
        target.y + (0.5 - y / 64) * 0.7,
        target.z + (Math.random() - 0.5) * 0.08,
      ),
    )
  }
}

interface LetterPiece {
  mesh: THREE.Mesh
  from: THREE.Vector3
  char: string
}

export class FinaleWorld {
  readonly group = new THREE.Group()
  private letters: LetterPiece[] = []
  private points: THREE.Points
  private mat: THREE.ShaderMaterial
  private played = false
  private count: number
  private light: THREE.PointLight
  private letterTargets: THREE.Vector3[] = []
  private morphing = false
  private startPositions: Float32Array
  private endPositions: Float32Array
  private colors: Float32Array
  private morph = { t: 0 }

  constructor(tier: QualityTier) {
    this.group.position.set(0, 0, -62)

    const chars = finaleCopy.headline.replace(/\s/g, '').split('')
    const spacing = 0.72
    const totalW = (chars.length - 1) * spacing

    chars.forEach((ch, i) => {
      const tex = makeLetterTexture(ch)
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        roughness: 0.35,
        metalness: 0.25,
        emissive: new THREE.Color('#d4b483'),
        emissiveIntensity: 0.28,
        emissiveMap: tex,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat)
      const target = new THREE.Vector3(
        -totalW / 2 + i * spacing + (i >= 5 ? 0.25 : 0),
        i >= 5 ? -0.55 : 0.45,
        0,
      )
      mesh.position.copy(target)
      mesh.scale.setScalar(0.15)
      mesh.userData.target = target.clone()
      this.group.add(mesh)
      this.letters.push({ mesh, from: target.clone(), char: ch })

      const perLetter = Math.max(24, Math.floor(particleBudget(tier).finale / chars.length))
      sampleLetterPoints(ch, target, this.letterTargets, perLetter)
    })

    this.count = Math.max(this.letterTargets.length, particleBudget(tier).finale)
    while (this.letterTargets.length < this.count) {
      const src = this.letterTargets[this.letterTargets.length % Math.max(1, this.letters.length)]
      this.letterTargets.push(
        src
          ? src.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, 0))
          : new THREE.Vector3(),
      )
    }

    const positions = new Float32Array(this.count * 3)
    const scales = new Float32Array(this.count)
    const seeds = new Float32Array(this.count)
    this.startPositions = new Float32Array(this.count * 3)
    this.endPositions = new Float32Array(this.count * 3)
    this.colors = new Float32Array(this.count * 3)

    for (let i = 0; i < this.count; i++) {
      const end = this.letterTargets[i]
      this.endPositions[i * 3] = end.x
      this.endPositions[i * 3 + 1] = end.y
      this.endPositions[i * 3 + 2] = end.z
      positions[i * 3] = (Math.random() - 0.5) * 10
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4
      this.startPositions[i * 3] = positions[i * 3]
      this.startPositions[i * 3 + 1] = positions[i * 3 + 1]
      this.startPositions[i * 3 + 2] = positions[i * 3 + 2]
      // Default warm placeholder until portal colors are sampled
      this.colors[i * 3] = 0.85
      this.colors[i * 3 + 1] = 0.7
      this.colors[i * 3 + 2] = 0.5
      scales[i] = 0.45 + Math.random()
      seeds[i] = Math.random()
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3))
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: softParticleVertex,
      fragmentShader: softParticleFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSize: { value: tier === 'low' ? 16 : 26 },
        uColor: { value: new THREE.Color('#f0d7b0') },
        uColorMix: { value: 0 },
      },
    })
    this.points = new THREE.Points(geo, this.mat)
    this.points.visible = false
    this.group.add(this.points)

    this.light = new THREE.PointLight('#ffd5a0', 0, 24)
    this.light.position.set(0, 0, 2)
    this.group.add(this.light)
  }

  /**
   * Seed particles at portal silhouettes with *sampled* portal pixel colors,
   * then morph into letter glyphs. Color warms toward the final palette mid-flight.
   */
  playFromPortals(
    portalWorldPositions: THREE.Vector3[],
    portalColorSamples?: Float32Array[],
  ): void {
    if (this.played) return
    this.played = true
    this.morphing = true
    sound.play('finale', 0.55)

    const localPortals = portalWorldPositions.map((p) => {
      const local = p.clone().sub(this.group.position)
      local.z = 5.5 + (Math.random() - 0.5) * 2.5
      return local
    })

    const nPortals = Math.max(1, localPortals.length)
    for (let i = 0; i < this.count; i++) {
      const portalIdx = i % nPortals
      const portal = localPortals[portalIdx] ?? new THREE.Vector3()
      const ring = (i / this.count) * Math.PI * 8
      const radius = 0.2 + (i % 23) * 0.055
      this.startPositions[i * 3] = portal.x + Math.cos(ring) * radius + (Math.random() - 0.5) * 0.45
      this.startPositions[i * 3 + 1] = portal.y + Math.sin(ring) * radius + (Math.random() - 0.5) * 0.45
      this.startPositions[i * 3 + 2] = portal.z + (Math.random() - 0.5) * 1.2

      // Sample actual portal texture colors when available
      const samples = portalColorSamples?.[portalIdx]
      if (samples && samples.length >= 3) {
        const pixelCount = Math.floor(samples.length / 3)
        const pi = (i * 7 + portalIdx * 13) % pixelCount
        this.colors[i * 3] = samples[pi * 3]
        this.colors[i * 3 + 1] = samples[pi * 3 + 1]
        this.colors[i * 3 + 2] = samples[pi * 3 + 2]
      }
    }

    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const col = this.points.geometry.getAttribute('aColor') as THREE.BufferAttribute
    for (let i = 0; i < this.count; i++) {
      pos.setXYZ(
        i,
        this.startPositions[i * 3],
        this.startPositions[i * 3 + 1],
        this.startPositions[i * 3 + 2],
      )
      col.setXYZ(i, this.colors[i * 3], this.colors[i * 3 + 1], this.colors[i * 3 + 2])
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    this.points.visible = true
    this.mat.uniforms.uSize.value = 42
    this.mat.uniforms.uColorMix.value = 0
    this.mat.uniforms.uColor.value.set('#f6e2c0')
    // Prefer normal blending while colors are vivid so sampled pixels read clearly
    this.mat.blending = THREE.NormalBlending
    this.mat.needsUpdate = true

    this.letters.forEach((l) => {
      const mat = l.mesh.material as THREE.MeshStandardMaterial
      mat.opacity = 0
      l.mesh.scale.setScalar(0.35)
      l.mesh.position.copy(l.mesh.userData.target as THREE.Vector3)
    })

    if (prefersReducedMotion()) {
      for (let i = 0; i < this.count; i++) {
        pos.setXYZ(
          i,
          this.endPositions[i * 3],
          this.endPositions[i * 3 + 1],
          this.endPositions[i * 3 + 2],
        )
      }
      pos.needsUpdate = true
      this.mat.uniforms.uColorMix.value = 1
      this.letters.forEach((l) => {
        l.mesh.scale.setScalar(1)
        ;(l.mesh.material as THREE.MeshStandardMaterial).opacity = 1
      })
      this.light.intensity = 2.2
      this.morphing = false
      return
    }

    this.morph.t = 0
    const tl = gsap.timeline()

    tl.to(this.morph, {
      t: 1,
      duration: 2.6,
      ease: 'power2.inOut',
      onUpdate: () => this.applyMorph(this.morph.t),
    }, 0)

    // Hold memory pixel colors through most of the morph, then warm to gold
    tl.to(this.mat.uniforms.uColorMix, { value: 1, duration: 1.2, ease: 'power2.inOut' }, 1.55)
    tl.add(() => {
      this.mat.blending = THREE.AdditiveBlending
      this.mat.needsUpdate = true
    }, 1.55)
    tl.to(this.mat.uniforms.uSize, { value: 8, duration: 1.4, ease: 'power2.in' }, 1.3)

    this.letters.forEach((l, i) => {
      const mat = l.mesh.material as THREE.MeshStandardMaterial
      tl.to(mat, { opacity: 1, duration: 0.85, ease: 'power2.out' }, 1.7 + i * 0.04)
      tl.to(
        l.mesh.scale,
        { x: 1.04, y: 1.04, z: 1, duration: 0.7, ease: 'back.out(1.35)' },
        1.7 + i * 0.04,
      )
      tl.to(l.mesh.scale, { x: 1, y: 1, z: 1, duration: 0.3 }, 2.3 + i * 0.04)
    })

    tl.to(this.light, { intensity: 2.4, duration: 1.8, ease: 'power2.out' }, 1.4)
    tl.add(() => {
      this.morphing = false
    }, 2.8)
  }

  play(camera: THREE.PerspectiveCamera): void {
    if (this.played) return
    const fake = [
      new THREE.Vector3(-2, 1, -42),
      new THREE.Vector3(2, 1, -42),
      new THREE.Vector3(-1.5, -1, -42),
      new THREE.Vector3(2, -1, -42),
    ]
    this.playFromPortals(fake)
    if (!prefersReducedMotion()) {
      gsap.to(camera.position, { z: camera.position.z - 1.0, duration: 2.2, ease: 'power3.inOut' })
    }
  }

  absorbFromPortals(portalPositions: THREE.Vector3[]): void {
    void portalPositions
  }

  private applyMorph(t: number): void {
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const ease = t * t * (3 - 2 * t)
    for (let i = 0; i < this.count; i++) {
      const sx = this.startPositions[i * 3]
      const sy = this.startPositions[i * 3 + 1]
      const sz = this.startPositions[i * 3 + 2]
      const ex = this.endPositions[i * 3]
      const ey = this.endPositions[i * 3 + 1]
      const ez = this.endPositions[i * 3 + 2]
      const arc = Math.sin(Math.PI * ease) * (0.6 + (i % 5) * 0.08)
      pos.setXYZ(
        i,
        sx + (ex - sx) * ease,
        sy + (ey - sy) * ease + arc,
        sz + (ez - sz) * ease,
      )
    }
    pos.needsUpdate = true
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time
    if (this.played && !this.morphing && !prefersReducedMotion()) {
      this.letters.forEach((l, i) => {
        l.mesh.position.y += Math.sin(time * 0.8 + i) * 0.0003
      })
    }
  }

  dispose(): void {
    this.letters.forEach((l) => {
      l.mesh.geometry.dispose()
      const m = l.mesh.material as THREE.MeshStandardMaterial
      m.map?.dispose()
      m.emissiveMap?.dispose()
      m.dispose()
    })
    this.points.geometry.dispose()
    this.mat.dispose()
  }
}
