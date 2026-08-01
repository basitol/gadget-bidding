/** Structured gadget listing fields stored in Gadget.specifications */

export const STORAGE_OPTIONS = [
  '64GB',
  '128GB',
  '256GB',
  '512GB',
  '1TB',
  '2TB',
  'Other',
] as const;

export const RAM_OPTIONS = [
  '8GB',
  '16GB',
  '18GB',
  '24GB',
  '32GB',
  '36GB',
  '48GB',
  '64GB',
  'Other',
] as const;

export const WARRANTY_OPTIONS = [
  { id: 'none', label: 'No warranty' },
  { id: 'seller', label: 'Seller warranty' },
  { id: 'manufacturer', label: 'Manufacturer warranty' },
  { id: 'applecare', label: 'AppleCare' },
] as const;

export const INCLUDED_OPTIONS = [
  { id: 'box', label: 'Original box' },
  { id: 'charger', label: 'Charger' },
  { id: 'cable', label: 'Cable' },
  { id: 'earphones', label: 'Earphones' },
  { id: 'case', label: 'Case' },
  { id: 'other', label: 'Other accessories' },
] as const;

export const CHECK_STATUS_OPTIONS = [
  { id: 'clean', label: 'Clean' },
  { id: 'locked', label: 'Locked / flagged' },
  { id: 'unknown', label: 'Not checked' },
] as const;

export const MDM_STATUS_OPTIONS = [
  { id: 'clean', label: 'Clean (no MDM)' },
  { id: 'enrolled', label: 'MDM enrolled' },
  { id: 'unknown', label: 'Not checked' },
] as const;

export const UNLOCK_STATUS_OPTIONS = [
  { id: 'factory_unlocked', label: 'Factory unlocked' },
  { id: 'carrier_locked', label: 'Carrier locked' },
  { id: 'unknown', label: 'Unknown' },
] as const;

export const CHIP_REGION_OPTIONS = [
  { id: 'worldwide', label: 'Worldwide chip' },
  { id: 'china_dual_physical', label: 'China dual physical SIM' },
  { id: 'other', label: 'Other' },
] as const;

export const SIM_CONFIG_OPTIONS = [
  { id: 'dual_physical', label: 'Dual physical SIM' },
  { id: 'physical_esim', label: 'Physical + eSIM' },
  { id: 'esim_only', label: 'eSIM only' },
  { id: 'wifi_only', label: 'Wi‑Fi only (eSIM locked)' },
] as const;

export type GadgetSpecKey =
  | 'color'
  | 'storage'
  | 'ram'
  | 'warranty'
  | 'included'
  | 'battery_health'
  | 'cycle_count'
  | 'icloud_status'
  | 'mdm_status'
  | 'imei_blacklist'
  | 'unlock_status'
  | 'chip_region'
  | 'sim_config';

export const GADGET_SPEC_LABELS: Record<GadgetSpecKey, string> = {
  color: 'Color',
  storage: 'Storage',
  ram: 'RAM',
  warranty: 'Warranty',
  included: "What's included",
  battery_health: 'Battery health',
  cycle_count: 'Cycle count',
  icloud_status: 'iCloud',
  mdm_status: 'MDM',
  imei_blacklist: 'IMEI / blacklist',
  unlock_status: 'Unlock status',
  chip_region: 'Chip region',
  sim_config: 'SIM configuration',
};

/** Preferred display order for specification keys */
export const GADGET_SPEC_ORDER: GadgetSpecKey[] = [
  'color',
  'storage',
  'ram',
  'warranty',
  'included',
  'battery_health',
  'cycle_count',
  'icloud_status',
  'mdm_status',
  'imei_blacklist',
  'unlock_status',
  'chip_region',
  'sim_config',
];

const VALUE_LABELS: Record<string, Record<string, string>> = {
  warranty: Object.fromEntries(WARRANTY_OPTIONS.map(o => [o.id, o.label])),
  icloud_status: Object.fromEntries(
    CHECK_STATUS_OPTIONS.map(o => [o.id, o.label])
  ),
  mdm_status: Object.fromEntries(MDM_STATUS_OPTIONS.map(o => [o.id, o.label])),
  imei_blacklist: Object.fromEntries(
    CHECK_STATUS_OPTIONS.map(o => [o.id, o.label])
  ),
  unlock_status: Object.fromEntries(
    UNLOCK_STATUS_OPTIONS.map(o => [o.id, o.label])
  ),
  chip_region: Object.fromEntries(CHIP_REGION_OPTIONS.map(o => [o.id, o.label])),
  sim_config: Object.fromEntries(SIM_CONFIG_OPTIONS.map(o => [o.id, o.label])),
  included: Object.fromEntries(INCLUDED_OPTIONS.map(o => [o.id, o.label])),
};

export function formatSpecValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—';

  if (key === 'battery_health' && typeof value === 'number') {
    return `${value}%`;
  }
  if (key === 'cycle_count' && typeof value === 'number') {
    return String(value);
  }
  if (key === 'included' && Array.isArray(value)) {
    return value
      .map(v => VALUE_LABELS.included[String(v)] || String(v))
      .join(', ');
  }

  const map = VALUE_LABELS[key];
  if (map && typeof value === 'string' && map[value]) {
    return map[value];
  }

  return String(value);
}

export function formatSpecLabel(key: string): string {
  return GADGET_SPEC_LABELS[key as GadgetSpecKey] || key.replace(/_/g, ' ');
}

export type SpecEntry = { key: string; label: string; value: string };

export function getOrderedSpecEntries(
  specifications?: Record<string, unknown> | null
): SpecEntry[] {
  if (!specifications || typeof specifications !== 'object') return [];

  const keys = new Set(Object.keys(specifications));
  const ordered: string[] = [];

  for (const key of GADGET_SPEC_ORDER) {
    if (keys.has(key)) {
      ordered.push(key);
      keys.delete(key);
    }
  }
  ordered.push(...Array.from(keys).sort());

  return ordered
    .filter(key => {
      const v = specifications[key];
      if (v == null || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    })
    .map(key => ({
      key,
      label: formatSpecLabel(key),
      value: formatSpecValue(key, specifications[key]),
    }));
}

export function suggestListingTitle(
  brand: string,
  model: string,
  storage?: string
): string {
  const parts = [brand.trim(), model.trim()];
  if (storage && storage !== 'Other') parts.push(storage.trim());
  return parts.filter(Boolean).join(' ');
}

export function isApplePhoneListing(
  categoryName?: string,
  brand?: string,
  model?: string
): boolean {
  const cat = (categoryName || '').toLowerCase();
  const b = (brand || '').toLowerCase();
  const m = (model || '').toLowerCase();
  const isPhone =
    cat.includes('phone') || cat.includes('smartphone') || m.includes('iphone');
  const isApple = b.includes('apple') || m.includes('iphone');
  return isPhone && isApple;
}

export function isAppleLaptopListing(
  categoryName?: string,
  brand?: string,
  model?: string
): boolean {
  const cat = (categoryName || '').toLowerCase();
  const b = (brand || '').toLowerCase();
  const m = (model || '').toLowerCase();
  const isLaptop = cat.includes('laptop') || m.includes('macbook');
  const isApple = b.includes('apple') || m.includes('macbook');
  return isLaptop && isApple;
}

export interface GadgetSpecifications {
  color?: string;
  storage?: string;
  ram?: string;
  warranty?: string;
  included?: string[];
  battery_health?: number;
  cycle_count?: number;
  icloud_status?: string;
  mdm_status?: string;
  imei_blacklist?: string;
  unlock_status?: string;
  chip_region?: string;
  sim_config?: string;
  [key: string]: unknown;
}
