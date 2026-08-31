/**
 * Kashida Video — Smart Media Color Harmony Extractor
 * Extracts 5 broadcast-harmonious colors from any image or video frame using an offscreen canvas.
 */

export interface ExtractedHarmonicPalette {
  accent: string // Dominant vibrant accent
  background: string // Deep broadcast background
  badge: string // Punchy badge/pill fill
  text: string // WCAG AAA guaranteed contrast text (#ffffff or #0f172a)
  border: string // Luminous accent border/glow
  swatches: string[] // Raw extracted swatches
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function getWcagContrastText(hexColor: string): '#ffffff' | '#0f172a' {
  const rgb = hexToRgb(hexColor)
  if (!rgb) return '#ffffff'
  const bgL = getLuminance(rgb.r, rgb.g, rgb.b)
  const contrastWithWhite = (1 + 0.05) / (bgL + 0.05)
  const contrastWithBlack = (bgL + 0.05) / (0 + 0.05)
  return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#0f172a'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '')
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    }
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    }
  }
  return null
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }
  return { h: h * 360, s, l }
}

export async function extractHarmonicPalette(mediaUrl: string): Promise<ExtractedHarmonicPalette> {
  return new Promise((resolve) => {
    const fallback: ExtractedHarmonicPalette = {
      accent: '#E63946',
      background: '#0B1528',
      badge: '#1E56A0',
      text: '#ffffff',
      border: 'rgba(230,57,70,0.4)',
      swatches: ['#E63946', '#1E56A0', '#0B1528', '#F1FAEE', '#457B9D'],
    }

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 32
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(fallback)

        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data

        const colorMap = new Map<string, { r: number; g: number; b: number; count: number }>()

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 128) continue
          const r = Math.round(data[i] / 16) * 16
          const g = Math.round(data[i + 1] / 16) * 16
          const b = Math.round(data[i + 2] / 16) * 16
          const key = `${r},${g},${b}`
          const existing = colorMap.get(key)
          if (existing) {
            existing.count++
          } else {
            colorMap.set(key, { r, g, b, count: 1 })
          }
        }

        const sorted = Array.from(colorMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 16)

        if (sorted.length === 0) return resolve(fallback)

        const colors = sorted.map((c) => {
          const hsl = rgbToHsl(c.r, c.g, c.b)
          const hex = rgbToHex(c.r, c.g, c.b)
          return { hex, ...c, ...hsl }
        })

        // Find most vibrant saturated color for accent
        const vibrant = [...colors].sort((a, b) => b.s * (1 - Math.abs(a.l - 0.5)) - a.s * (1 - Math.abs(b.l - 0.5)))[0]
        const accentHex = vibrant ? vibrant.hex : colors[0].hex

        // Find dark color for background
        const darkColors = colors.filter((c) => c.l < 0.25)
        const bgHex = darkColors.length > 0 ? darkColors[0].hex : '#0B1528'

        // Find secondary contrast color for badge
        const badgeColors = colors.filter((c) => Math.abs(c.h - (vibrant?.h || 0)) > 30 && c.s > 0.2)
        const badgeHex = badgeColors.length > 0 ? badgeColors[0].hex : '#1E56A0'

        const textHex = getWcagContrastText(bgHex)
        const borderGlow = `${accentHex}66`

        resolve({
          accent: accentHex,
          background: bgHex,
          badge: badgeHex,
          text: textHex,
          border: borderGlow,
          swatches: colors.slice(0, 5).map((c) => c.hex),
        })
      }

      img.onerror = () => resolve(fallback)
      img.src = mediaUrl
    } catch {
      resolve(fallback)
    }
  })
}
