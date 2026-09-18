/** مناطق ومدن التوصيل
 * طرابلس: مندوبون محليون (OWN_AGENTS)
 * المدن الخارجية: تُجلب من Accuratess عبر StoreService.deliveryOptions()
 * EXTERNAL_CITIES هنا fallback فقط إذا فشل/غير مفعّل Accuratess
 */

export type DeliveryZoneMode = 'OWN_AGENTS' | 'EXTERNAL_COMPANY_PENDING';

export type DeliveryArea = {
  nameAr: string;
  fee?: number; // إن وُجد يتجاوز رسوم المدينة
};

export type DeliveryCity = {
  nameAr: string;
  aliases?: string[];
  mode: DeliveryZoneMode;
  /** رسوم افتراضية للمدينة إن لم تُحدَّد للمنطقة */
  defaultFeeKey: 'tripoli' | 'external';
  areas: DeliveryArea[];
};

export type DeliveryGenderCode = 'MALE' | 'FEMALE';

export function parseDeliveryGender(value?: string | null): DeliveryGenderCode | undefined {
  const v = (value || '').trim().toUpperCase();
  if (v === 'MALE' || v === 'M' || v === 'رجالي' || v === 'رجل') return 'MALE';
  if (v === 'FEMALE' || v === 'F' || v === 'نسائي' || v === 'نساء') return 'FEMALE';
  return undefined;
}

export function deliveryGenderLabelAr(gender: DeliveryGenderCode) {
  return gender === 'FEMALE' ? 'نسائي' : 'رجالي';
}

export const TRIPOLI_AREAS: DeliveryArea[] = [
  { nameAr: 'المدينة القديمة' },
  { nameAr: 'باب البحر' },
  { nameAr: 'باب الجديد' },
  { nameAr: 'الظهرة' },
  { nameAr: 'الدهماني' },
  { nameAr: 'زاوية الدهماني' },
  { nameAr: 'النوفليين' },
  { nameAr: 'بن عاشور' },
  { nameAr: 'غوط الشعال' },
  { nameAr: 'حي الأندلس' },
  { nameAr: 'حي دمشق' },
  { nameAr: 'الهضبة' },
  { nameAr: 'الهضبة الشرقية' },
  { nameAr: 'الهضبة الغربية' },
  { nameAr: 'الفرناج' },
  { nameAr: 'القرقارش' },
  { nameAr: 'المنشية' },
  { nameAr: 'سيدي المصري' },
  { nameAr: 'باب عكارة' },
  { nameAr: 'الصومعة' },
  { nameAr: 'حي القدس' },
  { nameAr: 'الهاني' },
  { nameAr: 'صلاح الدين' },
  { nameAr: 'الكريمية' },
  { nameAr: 'فلاح' },
  { nameAr: 'حي الإنطلاق' },
  { nameAr: 'الزهور' },
  { nameAr: 'السائح' },
  { nameAr: 'وادي الربيع' },
  { nameAr: 'حي الكويت' },
  { nameAr: 'شط الهنشير' },
  { nameAr: 'الثلاثاء' },
  { nameAr: 'أبو سليم' },
  { nameAr: 'عين زارة' },
  { nameAr: 'سوق الجمعة' },
  { nameAr: 'تاجوراء' },
  { nameAr: 'جنزور' },
  { nameAr: 'السراج' },
  { nameAr: 'المعمورة' },
  { nameAr: 'قصر بن غشير' },
  { nameAr: 'السبعة' },
  { nameAr: 'السواني' },
  { nameAr: 'الماية' },
  { nameAr: 'القره بوللي' },
  { nameAr: 'أخرى داخل طرابلس' },
];

export const EXTERNAL_CITIES: DeliveryCity[] = [
  { nameAr: 'مصراتة', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'بنغازي', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'الزاوية', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'صبراتة', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'الخمس', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'زليتن', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'سبها', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'البيضاء', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'درنة', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'طبرق', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'غريان', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'المركز' }, { nameAr: 'أخرى' }] },
  { nameAr: 'مدينة أخرى', mode: 'EXTERNAL_COMPANY_PENDING', defaultFeeKey: 'external', areas: [{ nameAr: 'أخرى' }] },
];

export const DELIVERY_CITIES: DeliveryCity[] = [
  {
    nameAr: 'طرابلس',
    aliases: ['tripoli', 'طرابلس الكبرى'],
    mode: 'OWN_AGENTS',
    defaultFeeKey: 'tripoli',
    areas: TRIPOLI_AREAS,
  },
  ...EXTERNAL_CITIES,
];

export function findDeliveryCity(city?: string): DeliveryCity {
  const n = (city || '').trim().toLowerCase();
  if (!n) return DELIVERY_CITIES[0];
  const found = DELIVERY_CITIES.find((c) => {
    if (c.nameAr === city?.trim()) return true;
    if (c.nameAr.toLowerCase() === n) return true;
    return (c.aliases || []).some((a) => n.includes(a.toLowerCase()) || a.toLowerCase().includes(n));
  });
  if (found) return found;
  // أي مدينة غير معروفة = توصيل خارجي بانتظار API الشركة
  if (n.includes('طرابلس') || n.includes('tripoli')) return DELIVERY_CITIES[0];
  return {
    nameAr: city!.trim(),
    mode: 'EXTERNAL_COMPANY_PENDING',
    defaultFeeKey: 'external',
    areas: [{ nameAr: 'أخرى' }],
  };
}

export function findAreaFee(city: DeliveryCity, area?: string): number | undefined {
  const a = (area || '').trim();
  if (!a) return undefined;
  const match = city.areas.find((x) => x.nameAr === a);
  return match?.fee;
}
