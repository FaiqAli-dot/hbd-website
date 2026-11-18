import * as THREE from 'three'
import gsap from 'gsap'
import { circlePhotos } from '../../content/config'
import { circleMaskFragment, photoRevealVertex } from '../shaders'

export class LetterWorld {
  readonly group = new THREE.Group()
  private discs: THREE.Mesh[] = []
  private mats: THREE.ShaderMaterial[] = []
  private rims: THREE.Mesh[] = []
  private loader = new THREE.TextureLoader()
  private revealed = false
  private circleTextures: Array<THREE.Texture | null> = []

  constructor() {
    this.group.position.set(0, 0, -22)

    const placements = [
      { x: -2.6, y: 1.4, z: 0.4, s: 0.95 },
      { x: 2.8, y: 1.1, z: -0.2, s: 1.15 },
      { x: -2.9, y: -0.6, z: 0.8, s: 0.8 },
      { x: 2.4, y: -1.0, z: 0.2, s: 1.0 },
      { x: -1.6, y: -1.6, z: -0.5, s: 0.7 },
      { x: 1.7, y: 0.2, z: 1.1, s: 0.75 },
    ]

    circlePhotos.forEach((photo, i) => {
      const place = placements[i] ?? placements[0]
      this.circleTextures[i] = null
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: null },
          uSoft: { value: 0.08 },
          uBoost: { value: 0.05 },
          uOpacity: { value: 0 },
          uRim: { value: 0 },
          uGlow: { value: 0 },
          uWash: { value: 0 },
        },
        vertexShader: photoRevealVertex,
        fragmentShader: circleMaskFragment,
      })
      this.mats.push(mat)
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(place.s, 64), mat)
      mesh.position.set(place.x * 1.6, place.y * 1.4, place.z - 2)
      mesh.scale.setScalar(0.2)
      mesh.userData.rest = { ...place }
      this.discs.push(mesh)
      this.group.add(mesh)

      const rim = new THREE.Mesh(
        new THREE.RingGeometry(place.s * 0.98, place.s * 1.06, 64),
        new THREE.MeshBasicMaterial({
          color: '#0047ab',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      )
      rim.position.copy(mesh.position)
      this.rims.push(rim)
      this.group.add(rim)

      this.loader.load(photo.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        this.circleTextures[i] = tex
        // Only apply if we haven't already inherited a gallery texture for handoff
        if (!mat.uniforms.uMap.value) mat.uniforms.uMap.value = tex
      })
    })
  }

  getDiscMeshes(): THREE.Mesh[] {
    return this.discs
  }

  getDiscWorldTargets(): Array<{ x: number; y: number; z: number }> {
    return this.discs.map((mesh) => {
      const rest = mesh.userData.rest as { x: number; y: number; z: number }
      return {
        x: rest.x + this.group.position.x,
        y: rest.y + this.group.position.y,
        z: rest.z + this.group.position.z,
      }
    })
  }

  /**
   * Continuous Ch1→Ch2 morph (finale-quality handoff):
   * discs inherit gallery photo textures + world poses, stay fully visible
   * while planes circularize into them, then settle and crossfade to circle art.
   */
  playContinuousFromPhotos(
    handoff: Array<{
      worldPos: THREE.Vector3
      texture: THREE.Texture
      scale: number
      rotation: THREE.Euler
    }>,
  ): void {
    if (this.revealed) return
    this.revealed = true

    this.discs.forEach((mesh, i) => {
      const rest = mesh.userData.rest as { x: number; y: number; z: number; s: number }
      const src = handoff[i % Math.max(1, handoff.length)]
      if (src) {
        mesh.position.set(
          src.worldPos.x - this.group.position.x,
          src.worldPos.y - this.group.position.y,
          src.worldPos.z - this.group.position.z,
        )
        // Match outgoing plane scale so the cut is invisible
        const s = Math.max(0.45, src.scale * 0.85)
        mesh.scale.set(s, s, 1)
        mesh.rotation.set(src.rotation.x * 0.3, src.rotation.y * 0.3, src.rotation.z)
        this.mats[i].uniforms.uMap.value = src.texture
        this.mats[i].uniforms.uOpacity.value = 1
        this.rims[i].position.copy(mesh.position)
        ;(this.rims[i].material as THREE.MeshBasicMaterial).opacity = 0.15
      }

      gsap.to(mesh.position, {
        x: rest.x,
        y: rest.y,
        z: rest.z,
        duration: 1.65,
        delay: i * 0.05,
        ease: 'power3.inOut',
      })
      gsap.to(mesh.rotation, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1.4,
        delay: i * 0.05,
        ease: 'power2.inOut',
      })
      gsap.to(mesh.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 1.5,
        delay: i * 0.05,
        ease: 'power3.out',
      })
      gsap.to(this.rims[i].material as THREE.MeshBasicMaterial, {
        opacity: 0.35,
        duration: 0.9,
        delay: 0.45 + i * 0.05,
      })
      gsap.to(this.rims[i].position, {
        x: rest.x,
        y: rest.y,
        z: rest.z - 0.01,
        duration: 1.65,
        delay: i * 0.05,
        ease: 'power3.inOut',
      })

      // Peak briefly mid-morph, then fully clear before letter reading
      gsap.to(this.mats[i].uniforms.uOpacity, {
        value: 0.9,
        duration: 0.3,
        delay: 0.15 + i * 0.03,
      })
      gsap.to(this.mats[i].uniforms.uOpacity, {
        value: 0,
        duration: 0.55,
        delay: 0.95 + i * 0.03,
        ease: 'power2.in',
        onComplete: () => {
          mesh.visible = false
        },
      })
      gsap.to(this.rims[i].material as THREE.MeshBasicMaterial, {
        opacity: 0.25,
        duration: 0.3,
        delay: 0.2 + i * 0.03,
      })
      gsap.to(this.rims[i].material as THREE.MeshBasicMaterial, {
        opacity: 0,
        duration: 0.45,
        delay: 0.85 + i * 0.03,
        onComplete: () => {
          this.rims[i].visible = false
        },
      })
    })
  }

  /** Ensure every disc/rim is gone while the letter is being read */
  retireForReading(): void {
    this.discs.forEach((mesh, i) => {
      gsap.killTweensOf(mesh)
      gsap.killTweensOf(mesh.position)
      gsap.killTweensOf(mesh.scale)
      gsap.killTweensOf(mesh.rotation)
      gsap.killTweensOf(this.mats[i].uniforms.uOpacity)
      gsap.killTweensOf(this.rims[i])
      gsap.killTweensOf(this.rims[i].position)
      gsap.killTweensOf(this.rims[i].material)
      this.mats[i].uniforms.uOpacity.value = 0
      ;(this.rims[i].material as THREE.MeshBasicMaterial).opacity = 0
      mesh.visible = false
      this.rims[i].visible = false
      // Park far off-camera so nothing can accidentally reappear in frustum
      mesh.position.set(0, -40, -80)
      this.rims[i].position.set(0, -40, -80)
    })
  }

  playEntranceFrom(photoWorldPositions: THREE.Vector3[]): void {
    this.playContinuousFromPhotos(
      photoWorldPositions.map((worldPos) => ({
        worldPos,
        texture: this.mats[0]?.uniforms.uMap.value as THREE.Texture,
        scale: 0.55,
        rotation: new THREE.Euler(),
      })),
    )
  }

  playEntrance(): void {
    this.playEntranceFrom([])
  }

  dissolveForFinale(): gsap.core.Timeline {
    const tl = gsap.timeline()
    this.discs.forEach((mesh, i) => {
      tl.to(this.mats[i].uniforms.uOpacity, { value: 0, duration: 0.7, ease: 'power2.in' }, i * 0.03)
      tl.to(mesh.scale, { x: 0.02, y: 0.02, z: 1, duration: 0.85, ease: 'power3.in' }, i * 0.03)
      tl.to(
        this.rims[i].material as THREE.MeshBasicMaterial,
        { opacity: 0, duration: 0.35, ease: 'power2.in' },
        i * 0.03,
      )
    })
    tl.add(() => {
      this.discs.forEach((m) => {
        m.visible = false
      })
      this.rims.forEach((r) => {
        r.visible = false
        ;(r.material as THREE.MeshBasicMaterial).opacity = 0
      })
      this.group.visible = false
    })
    return tl
  }

  expandTowardPortals(targets: Array<{ x: number; y: number; z: number; s: number }>): gsap.core.Timeline {
    // Discs already retired during reading — keep this a no-op fade so giant rims never appear
    const tl = gsap.timeline()
    this.discs.forEach((mesh, i) => {
      mesh.visible = false
      this.rims[i].visible = false
      this.mats[i].uniforms.uOpacity.value = 0
      ;(this.rims[i].material as THREE.MeshBasicMaterial).opacity = 0
      void targets
    })
    return tl
  }

  update(time: number, pointer: { x: number; y: number }): void {
    if (!this.revealed) return
    this.discs.forEach((mesh, i) => {
      if (!mesh.visible) return
      const seed = i * 1.7
      mesh.position.y += Math.sin(time * 0.55 + seed) * 0.00085
      mesh.rotation.z = Math.sin(time * 0.35 + seed) * 0.05
      mesh.rotation.y = pointer.x * 0.18 + Math.sin(time * 0.2 + seed) * 0.05
      mesh.rotation.x = -pointer.y * 0.12
      this.rims[i].position.x = mesh.position.x
      this.rims[i].position.y = mesh.position.y
      this.rims[i].rotation.copy(mesh.rotation)
    })
  }

  dispose(): void {
    this.discs.forEach((m) => {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    })
    this.rims.forEach((m) => {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    })
  }
}
