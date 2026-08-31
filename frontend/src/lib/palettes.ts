export interface ColorPalette {
  id: string
  name: string
  nameAr: string
  primary: string
  secondary: string
  background: string
  text: string
  badge: string
  description: string
}

export const BROADCAST_PALETTES: ColorPalette[] = [
  {
    id: 'arabi21',
    name: 'Arabi21 Broadcast',
    nameAr: 'عربي21 الإخباري',
    primary: '#7C3AED',
    secondary: '#EA580C',
    background: '#0B0B0F',
    text: '#FFFFFF',
    badge: '#E41E3F',
    description: 'ألوان البث الرياضي والريلز (بنفسجي، برتقالي، كستنائي)',
  },
  {
    id: 'breaking_crimson',
    name: 'Breaking Crimson',
    nameAr: 'الأحمر العاجل',
    primary: '#DC2626',
    secondary: '#F59E0B',
    background: '#0F172A',
    text: '#FFFFFF',
    badge: '#B91C1C',
    description: 'أحمر عاجل عالي التباين مع خلفية كحلية داكنة',
  },
  {
    id: 'aljazeera_gold',
    name: 'Al Jazeera Gold',
    nameAr: 'الذهب الإخباري',
    primary: '#F59E0B',
    secondary: '#D97706',
    background: '#030712',
    text: '#FFFFFF',
    badge: '#1E3A8A',
    description: 'درجات الذهب الكلاسيكية مع خلفية سوداء عميقة',
  },
  {
    id: 'skynews_cyan',
    name: 'Sky News Modern',
    nameAr: 'السماوي العصري',
    primary: '#0284C7',
    secondary: '#EF4444',
    background: '#0F172A',
    text: '#F8FAFC',
    badge: '#0369A1',
    description: 'أزرق سماوي وأحمر إخباري مع تباين تقني حديث',
  },
  {
    id: 'thmanyah_editorial',
    name: 'Thmanyah Editorial',
    nameAr: 'ثمانية الثقافي',
    primary: '#1E56A0',
    secondary: '#F5B700',
    background: '#163172',
    text: '#F6F6F6',
    badge: '#D6E4F0',
    description: 'الهوية التحريرية الهادئة والموثوقة لمنصات الرأي والبودكاست',
  },
  {
    id: 'cyber_neon',
    name: 'Cyber Neon Sports',
    nameAr: 'النيون الرياضي',
    primary: '#8B5CF6',
    secondary: '#10B981',
    background: '#090D16',
    text: '#FFFFFF',
    badge: '#F43F5E',
    description: 'ألوان حيوية للرياضة والترندات والتيك توك',
  },
  {
    id: 'luxury_dark',
    name: 'Dark Luxury',
    nameAr: 'الفاخر الداكن',
    primary: '#CA8A04',
    secondary: '#A1A1AA',
    background: '#18181B',
    text: '#FAFAFA',
    badge: '#713F12',
    description: 'درجات النحاس والرمادي الداكن للتحقيقات والتقارير المعمقة',
  },
]
