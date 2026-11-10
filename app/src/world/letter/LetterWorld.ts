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
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: null },
          uSoft: { value: 0.08 },
          uBoost: { value: 0.05 },
          uOpacity: { value: 0 },
        },
        vertexShader: photoRevealVertex,
        fragmentShader: circleMaskFragment,
      })
      this.mats.push(mat)
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(place.s, 64), mat)
      // Start small / offset for entrance
      mesh.position.set(place.x * 1.6, place.y * 1.4, place.z - 2)
      mesh.scale.setScalar(0.2)
      mesh.userData.rest = { ...place }
      this.discs.push(mesh)
      this.group.add(mesh)

      const rim = new THREE.Mesh(
        new THREE.RingGeometry(place.s * 0.98, place.s * 1.06, 64),
        new THREE.MeshBasicMaterial({
          color: '#e8c9a0',
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
        mat.uniforms.uMap.value = tex
      })
    })
  }

  getDiscMeshes(): THREE.Mesh[] {
    return this.discs
  }

  playEntrance(): void {
    if (this.revealed) return
    this.revealed = true
    this.discs.forEach((mesh, i) => {
      const rest = mesh.userData.rest as { x: number; y: number; z: number; s: number }
      gsap.to(mesh.position, {
        x: rest.x,
        y: rest.y,
        z: rest.z,
        duration: 1.3,
        delay: i * 0.08,
        ease: 'back.out(1.5)',
      })
      gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 1.1, delay: i * 0.08, ease: 'power3.out' })
      gsap.to(this.mats[i].uniforms.uOpacity, { value: 1, duration: 0.8, delay: i * 0.08 })
      gsap.to(this.rims[i].material as THREE.MeshBasicMaterial, {
        opacity: 0.35,
        duration: 0.8,
        delay: i * 0.1,
      })
      gsap.to(this.rims[i].position, {
        x: rest.x,
        y: rest.y,
        z: rest.z - 0.01,
        duration: 1.3,
        delay: i * 0.08,
        ease: 'back.out(1.5)',
      })
    })
  }

  /** Expand circles toward memory portal layout */
  expandTowardPortals(targets: Array<{ x: number; y: number; z: number; s: number }>): gsap.core.Timeline {
    const tl = gsap.timeline()
    this.discs.forEach((mesh, i) => {
      const t = targets[i % targets.length]
      tl.to(
        mesh.position,
        {
          x: t.x,
          y: t.y,
          z: t.z - 20, // toward memories group local → world handled by Experience
          duration: 1.35,
          ease: 'power3.inOut',
        },
        0,
      )
      tl.to(mesh.scale, { x: t.s * 1.1, y: t.s * 1.1, z: 1, duration: 1.2, ease: 'power2.inOut' }, 0)
      tl.to(this.mats[i].uniforms.uOpacity, { value: 0.2, duration: 1.0 }, 0.3)
    })
    return tl
  }

  update(time: number, pointer: { x: number; y: number }): void {
    if (!this.revealed) return
    this.discs.forEach((mesh, i) => {
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
