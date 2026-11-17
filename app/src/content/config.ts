/**
 * Centralized content & asset configuration.
 * Swap photos, videos, copy, and audio here — no component logic changes needed.
 */

import gallery01 from '../assets/images/gallery/01.jpg'
import gallery02 from '../assets/images/gallery/02.jpg'
import gallery03 from '../assets/images/gallery/03.jpg'
import gallery04 from '../assets/images/gallery/04.jpg'
import gallery05 from '../assets/images/gallery/05.jpg'
import gallery06 from '../assets/images/gallery/06.jpg'
import gallery07 from '../assets/images/gallery/07.jpg'
import gallery08 from '../assets/images/gallery/08.jpg'

import circle01 from '../assets/images/circles/01.jpg'
import circle02 from '../assets/images/circles/02.jpg'
import circle03 from '../assets/images/circles/03.jpg'
import circle04 from '../assets/images/circles/04.jpg'
import circle05 from '../assets/images/circles/05.jpg'
import circle06 from '../assets/images/circles/06.jpg'

import video01 from '../assets/videos/memories/01.mp4'
import video02 from '../assets/videos/memories/02.mp4'
import video03 from '../assets/videos/memories/03.mp4'
import video04 from '../assets/videos/memories/04.mp4'

import poster01 from '../assets/images/memories/poster-01.jpg'
import poster02 from '../assets/images/memories/poster-02.jpg'
import poster03 from '../assets/images/memories/poster-03.jpg'
import poster04 from '../assets/images/memories/poster-04.jpg'

import ambient from '../assets/audio/ambient.mp3'
import reveal from '../assets/audio/reveal.mp3'
import transition from '../assets/audio/transition.mp3'
import finale from '../assets/audio/finale.mp3'

export type GestureDirection = 'left' | 'right' | 'up' | 'down'

export interface GalleryPhoto {
  id: string
  src: string
  alt: string
  gesture: GestureDirection
  caption: string
}

export interface CirclePhoto {
  id: string
  src: string
  alt: string
  /** Approximate placement hints used by the letter layout */
  position: {
    top?: string
    left?: string
    right?: string
    bottom?: string
    size: string
  }
}

export interface MemoryVideo {
  id: string
  src: string
  poster?: string
  caption: string
  label: string
}

export const siteMeta = {
  title: 'For You — Happy Birthday',
  description: 'An interactive birthday letter.',
  brand: 'For You',
}

export const galleryPhotos: GalleryPhoto[] = [
  {
    id: 'g1',
    src: gallery01,
    alt: 'Hands held softly in warm light',
    gesture: 'left',
    caption: 'The way your hand finds mine',
  },
  {
    id: 'g2',
    src: gallery02,
    alt: 'Couple sharing a quiet moment',
    gesture: 'right',
    caption: 'Quiet mornings, loud hearts',
  },
  {
    id: 'g3',
    src: gallery03,
    alt: 'Soft romantic embrace',
    gesture: 'up',
    caption: 'Closer than words',
  },
  {
    id: 'g4',
    src: gallery04,
    alt: 'Wedding rings and soft florals',
    gesture: 'down',
    caption: 'Promises we keep gently',
  },
  {
    id: 'g5',
    src: gallery05,
    alt: 'Fashion portrait in soft light',
    gesture: 'left',
    caption: 'You, in every frame',
  },
  {
    id: 'g6',
    src: gallery06,
    alt: 'Blooming peony flowers',
    gesture: 'right',
    caption: 'Petals and patience',
  },
  {
    id: 'g7',
    src: gallery07,
    alt: 'Candlelit dinner table',
    gesture: 'up',
    caption: 'Evenings that linger',
  },
  {
    id: 'g8',
    src: gallery08,
    alt: 'Soft portrait in natural light',
    gesture: 'down',
    caption: 'My favorite view',
  },
]

export const letterCopy = {
  /** Greeting line shown above the body */
  eyebrow: 'My Babygirl,',
  paragraphs: [
    `Happy Birthday to my person.`,
    `Sometimes I think about how many little moments we've managed to turn into memories. The dates, the outings, the random conversations, the laughs, the pictures, and all those times we've simply enjoyed each other's company. Some were planned, some happened spontaneously, but somehow they've all become little pieces of a story that I'm really happy we're writing together.`,
    `One of my favorite things about us is that there's always something to look forward to. Another place to discover, another experience to share, another memory to add to the collection. And even when there's no plan, no special occasion, or nothing particularly exciting happening, having you around makes it worth it.`,
    `I hope you never stop being curious, dreaming big, trying new things, and becoming everything you want to be. I hope life surprises you in the most beautiful ways, opens doors you never imagined, and gives you countless reasons to smile. You deserve to experience so many wonderful things, and I hope this next year brings plenty of them.`,
    `And selfishly, I hope I get to be part of many more of those moments. More adventures, more silly pictures, more spontaneous plans, more dinners, more celebrations, and more stories that we'll look back on and laugh about.`,
    `I'm grateful for you, for us, and for everything we've shared so far. There's still so much left to experience, and I can't wait to see what we make of it.`,
    `Happy Birthday, beautiful. Here's to another year of you, and hopefully a thousand more memories together. ❤️`,
  ],
  /** Empty — closing lives in the final paragraph */
  signoff: '',
  signature: '',
}

export const circlePhotos: CirclePhoto[] = [
  {
    id: 'c1',
    src: circle01,
    alt: 'Soft portrait memory',
    position: { top: '8%', left: '6%', size: '7.5rem' },
  },
  {
    id: 'c2',
    src: circle02,
    alt: 'Smile in afternoon light',
    position: { top: '18%', right: '8%', size: '9rem' },
  },
  {
    id: 'c3',
    src: circle03,
    alt: 'Quiet glance',
    position: { top: '52%', left: '3%', size: '6.5rem' },
  },
  {
    id: 'c4',
    src: circle04,
    alt: 'Warm light portrait',
    position: { bottom: '18%', right: '5%', size: '8rem' },
  },
  {
    id: 'c5',
    src: circle05,
    alt: 'Editorial portrait',
    position: { bottom: '8%', left: '14%', size: '5.5rem' },
  },
  {
    id: 'c6',
    src: circle06,
    alt: 'Gentle expression',
    position: { top: '62%', right: '16%', size: '6rem' },
  },
]

export const memoryVideos: MemoryVideo[] = [
  {
    id: 'm1',
    src: video01,
    poster: poster01,
    caption: 'That winter smile',
    label: 'Smile',
  },
  {
    id: 'm2',
    src: video02,
    poster: poster02,
    caption: 'Soft afternoon light',
    label: 'Light',
  },
  {
    id: 'm3',
    src: video03,
    poster: poster03,
    caption: 'A quiet glance',
    label: 'Glance',
  },
  {
    id: 'm4',
    src: video04,
    poster: poster04,
    caption: 'Warm evening glow',
    label: 'Glow',
  },
]

export const finaleCopy = {
  headline: 'HAPPY BIRTHDAY',
  /** Stanza lines (lowercase, revealed under the handwritten Happy Birthday) */
  stanza1: [
    'to the girl whom my smile belongs to,',
    'my love regenerates for,',
    'my happiness resides within.',
  ],
  stanza2: ['to the first birthday celebration,', 'of many more to come.'],
  /** @deprecated kept empty so nothing stale can surface */
  subline: '',
  closing: '',
}

export const galleryCopy = {
  /** Quiet bottom-centre cue — direction filled in by Experience (e.g. "swipe →") */
  introHint: 'swipe →',
  scrollHint: 'scroll ↑',
  continueLabel: 'continue',
  undoLabel: 'Go back',
}

export const audioAssets = {
  ambient,
  reveal,
  transition,
  finale,
}

export const gestureOrder: GestureDirection[] = galleryPhotos.map((p) => p.gesture)
