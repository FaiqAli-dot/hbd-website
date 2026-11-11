import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

gsap.registerPlugin(CustomEase)

/** Anticipation in the Bezier path; ease is slow wind-up → confident middle → soft settle. */
export const MEMORY_GLIDE =
  CustomEase.create('memoryGlide', 'M0,0 C0.18,0 0.32,0.02 0.45,0.3 0.6,0.66 0.7,0.93 1,1')

export const memoryGlideEase = gsap.parseEase('memoryGlide')
