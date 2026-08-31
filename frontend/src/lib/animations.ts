// Animation presets — the single source of truth for how "friendly" entrance
// options map to real motion. Used by BOTH the live preview (Web Animations
// API) and the Code Generator (GSAP), so preview and export always match.

import type { AnimationType, BumperOutType, EasingName } from './model'

export const CSS_EASING: Record<EasingName, string> = {
  'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  'ease-in': 'cubic-bezier(0.7, 0, 0.84, 0)',
  'back-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  elastic: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
  spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  'expo-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  linear: 'linear',
}

// GSAP easing strings emitted by the Code Generator.
export const GSAP_EASING: Record<EasingName, string> = {
  'ease-out': 'power2.out',
  'ease-in-out': 'power2.inOut',
  'ease-in': 'power2.in',
  'back-out': 'back.out(1.7)',
  elastic: 'elastic.out(1,0.5)',
  spring: 'back.out(2.2)',
  'expo-out': 'expo.out',
  linear: 'none',
}

export interface FromState {
  opacity?: number
  x?: number
  y?: number
  scale?: number
  rotationX?: number
  filter?: string
}

// GSAP `from`-style state for an entrance animation (px units on a 1080-wide canvas).
export function gsapFrom(type: AnimationType): FromState {
  switch (type) {
    case 'fade-in':
      return { opacity: 0 }
    case 'slide-up':
      return { opacity: 0, y: 40 }
    case 'slide-down':
      return { opacity: 0, y: -40 }
    case 'slide-right':
      return { opacity: 0, x: 120 }
    case 'slide-left':
      return { opacity: 0, x: -120 }
    case 'zoom-in':
      return { opacity: 0, scale: 0.8 }
    case 'pop-bounce':
      return { opacity: 0, scale: 0.4 }
    case 'wipe-rtl':
      return { opacity: 0, scale: 0.95 }
    case 'word-stagger':
      return { opacity: 0, y: 30 }
    case 'flip-up':
      return { opacity: 0, y: 35, rotationX: 55 }
    case 'blur-reveal':
      return { opacity: 0, scale: 1.08 }
    case 'none':
      return {}
  }
}

// Web Animations API keyframes for the same entrance animation.
export function waaiKeyframes(type: AnimationType): Keyframe[] {
  switch (type) {
    case 'fade-in':
      return [{ opacity: 0 }, { opacity: 1 }]
    case 'slide-up':
      return [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'translateY(0px)' }]
    case 'slide-down':
      return [{ opacity: 0, transform: 'translateY(-40px)' }, { opacity: 1, transform: 'translateY(0px)' }]
    case 'slide-right':
      return [{ opacity: 0, transform: 'translateX(120px)' }, { opacity: 1, transform: 'translateX(0px)' }]
    case 'slide-left':
      return [{ opacity: 0, transform: 'translateX(-120px)' }, { opacity: 1, transform: 'translateX(0px)' }]
    case 'zoom-in':
      return [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }]
    case 'pop-bounce':
      return [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }]
    case 'wipe-rtl':
      return [{ opacity: 0, transform: 'scaleX(0)', transformOrigin: 'right center' }, { opacity: 1, transform: 'scaleX(1)', transformOrigin: 'right center' }]
    case 'word-stagger':
      return [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'translateY(0px)' }]
    case 'flip-up':
      return [{ opacity: 0, transform: 'perspective(600px) rotateX(55deg) translateY(35px)' }, { opacity: 1, transform: 'perspective(600px) rotateX(0deg) translateY(0px)' }]
    case 'blur-reveal':
      return [{ opacity: 0, filter: 'blur(10px)', transform: 'scale(1.08)' }, { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' }]
    case 'none':
      return []
  }
}

// GSAP `from`-style end state for EXIT transitions.
export function gsapOut(type: BumperOutType): FromState {
  switch (type) {
    case 'fade-out':
      return { opacity: 0 }
    case 'slide-up':
      return { opacity: 0, y: -40 }
    case 'slide-down':
      return { opacity: 0, y: 40 }
    case 'slide-left':
      return { opacity: 0, x: -120 }
    case 'slide-right':
      return { opacity: 0, x: 120 }
    case 'zoom-out':
      return { opacity: 0, scale: 0.8 }
    case 'none':
      return {}
  }
}

// Web Animations API keyframes for the same exit transition (from visible → out).
export function waaiOutKeyframes(type: BumperOutType): Keyframe[] {
  switch (type) {
    case 'fade-out':
      return [{ opacity: 1 }, { opacity: 0 }]
    case 'slide-up':
      return [{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(-40px)' }]
    case 'slide-down':
      return [{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(40px)' }]
    case 'slide-left':
      return [{ opacity: 1, transform: 'translateX(0px)' }, { opacity: 0, transform: 'translateX(-120px)' }]
    case 'slide-right':
      return [{ opacity: 1, transform: 'translateX(0px)' }, { opacity: 0, transform: 'translateX(120px)' }]
    case 'zoom-out':
      return [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.8)' }]
    case 'none':
      return []
  }
}
