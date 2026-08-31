export interface ArabicFont {
  id: string
  name: string
  family: string
  sample: string
  googleFont?: string
}

export const ARABIC_FONTS: ArabicFont[] = [
  { id: 'thmanyah', name: 'Thmanyah Sans (Official)', family: "'Thmanyah Sans', sans-serif", sample: 'كشيدة للأخبار والريلز' },
  { id: 'cairo', name: 'Cairo (Modern Editorial)', family: "'Cairo', sans-serif", sample: 'عاجل ورئيسي', googleFont: 'Cairo:wght@400;700;900' },
  { id: 'almarai', name: 'Almarai (Broadcast Clean)', family: "'Almarai', sans-serif", sample: 'تغطية إخبارية مميزة', googleFont: 'Almarai:wght@400;700;800' },
  { id: 'ibm-plex', name: 'IBM Plex Arabic (Technical)', family: "'IBM Plex Sans Arabic', sans-serif", sample: 'تقرير اقتصادي ومالي', googleFont: 'IBM+Plex+Sans+Arabic:wght@400;600;700' },
  { id: 'tajawal', name: 'Tajawal (Modern Geometric)', family: "'Tajawal', sans-serif", sample: 'ملخص رياضي شامل', googleFont: 'Tajawal:wght@400;700;900' },
  { id: 'readex', name: 'Readex Pro (Impact Headline)', family: "'Readex Pro', sans-serif", sample: 'تصريح حصري ومباشر', googleFont: 'Readex+Pro:wght@400;600;700' },
  { id: 'noto-naskh', name: 'Noto Naskh (Classic News)', family: "'Noto Naskh Arabic', serif", sample: 'بيان رسمي وصحفي', googleFont: 'Noto+Naskh+Arabic:wght@400;700' },
]

/**
 * Applies dynamic Arabic Kashida (Tatweel 'ـ') to stretch words evenly
 */
export function applyKashida(text: string, amount: number): string {
  if (!text || amount <= 0) return text
  const extendable = /([بتثجحخسشصضطظعغفقكلمنهي])([بتثجحخسشصضطظعغفقكلمنهيى])/g
  const tatweelCount = Math.min(6, Math.max(1, Math.round(amount / 16)))
  const tatweels = 'ـ'.repeat(tatweelCount)
  return text.replace(extendable, `$1${tatweels}$2`)
}
