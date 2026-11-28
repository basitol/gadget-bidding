import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LISTING_CATEGORIES,
  CONDITION_GRADES,
  profileByKey,
  photoSlotsFor,
  missingPhotos,
  isValidImei,
  type DeviceProfile,
  type ListingCategoryKey,
  type ListingSpecs,
  type PartSource,
  type SpecField,
} from '@gadget-bidding/shared';
import type { DeviceCheck, ListingConfig, ListingPayload } from '../../../services/listing.service';
import type { Gadget } from '../../../types';

/** Everything the seller has answered so far. Saved on the phone (per seller) as they go. */
export type Draft = {
  v: 1;
  saved_at: string | null;
  step: number;
  category_key: ListingCategoryKey | null;
  model: string;
  model_id: string | null;
  brand: string | null;
  /** The picked model says whether a maker's lookup exists for it (null: not from our list). */
  model_lookup: boolean | null;
  profile: string | null;
  /** Typed or scanned; never shown back to buyers (they see the masked one). */
  identifier: string;
  identifier_skipped: boolean;
  /** Editing: the server already has one ("3567…5231"); leaving the field empty keeps it. */
  identifier_on_file: string | null;
  check: DeviceCheck | null;
  checked: string | null;
  /** The seller's answer to "We found …": yes = use the lookup, no = edit by hand. */
  found_choice: 'yes' | 'no' | null;
  specs: Record<string, string | string[]>;
  from_serial: string[];
  locks: string[];
  condition: string | null;
  battery_health: string;
  all_works: boolean;
  faults: string[];
  included: string[];
  note: string;
  opened: 'never' | 'yes' | 'not_sure' | null;
  /** Ticked parts → where the replacement came from (null until picked). */
  parts: Record<string, PartSource | null>;
  parts_history: string | null;
  no_damage: boolean;
  damage: string[];
  photos: Record<string, string>;
  /** Older listings: their images, placed into the first slots once the kind is known. */
  legacy_images: string[];
  start_price: string;
  reserve_on: boolean;
  reserve_price: string;
  duration_hours: number;
};

export const EMPTY_DRAFT: Draft = {
  v: 1,
  saved_at: null,
  step: 1,
  category_key: null,
  model: '',
  model_id: null,
  brand: null,
  model_lookup: null,
  profile: null,
  identifier: '',
  identifier_skipped: false,
  identifier_on_file: null,
  check: null,
  checked: null,
  found_choice: null,
  specs: {},
  from_serial: [],
  locks: [],
  condition: null,
  battery_health: '',
  all_works: false,
  faults: [],
  included: [],
  note: '',
  opened: null,
  parts: {},
  parts_history: null,
  no_damage: false,
  damage: [],
  photos: {},
  legacy_images: [],
  start_price: '',
  reserve_on: false,
  reserve_price: '',
  duration_hours: 72,
};

export const STEP_NAMES = ['The item', 'Find the exact model', 'Specs & locks', 'Condition', 'Repairs & damage', 'Photos', 'Auction', 'Review'];
export const STEPS = 8;

/* ---------------- Saved on the phone ---------------- */

const key = (userId: string) => `listing_draft:${userId}`;

export const loadDraft = async (userId: string): Promise<Draft | null> => {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d?.v === 1 ? { ...EMPTY_DRAFT, ...d } : null;
  } catch {
    return null;
  }
};

export const saveDraft = (userId: string, d: Draft) =>
  AsyncStorage.setItem(key(userId), JSON.stringify({ ...d, saved_at: new Date().toISOString() })).catch(() => {});

export const clearDraft = (userId: string) => AsyncStorage.removeItem(key(userId)).catch(() => {});

/** Worth offering back: they've at least picked a category. */
export const hasProgress = (d: Draft) => !!d.category_key;

/* ---------------- Rules per step ---------------- */

export const normalizeIdentifier = (raw: string, kind: DeviceProfile['identifier']) =>
  kind === 'imei' ? raw.replace(/\D/g, '').slice(0, 15) : raw.replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, 30);

/** The seller's own words for the client-side IMEI check. */
export const imeiProblem = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length !== 15) return 'An IMEI has 15 digits. Dial *#06# to see it.';
  if (!isValidImei(d)) return "That IMEI doesn't look right. Check the 15 digits again.";
  return null;
};

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0);

export const specProblem = (field: SpecField, v: unknown): string | null => {
  if (!filled(v)) return field.required ? 'required' : null;
  if (field.type === 'number' && !/^\d{1,7}$/.test(String(v).replace(/,/g, ''))) return 'Use a whole number.';
  if (field.type === 'percent') {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'Use a number from 0 to 100.';
  }
  return null;
};

/** iPhones (whose battery health screen we ask a photo of) must say the %; others may. */
export const batteryRequired = (p: DeviceProfile) =>
  !!p.batteryHealth && p.photos.some(ph => ph.key === 'battery' && ph.required);

export const batteryProblem = (p: DeviceProfile, v: string): string | null => {
  if (!p.batteryHealth) return null;
  if (!v.trim()) return batteryRequired(p) ? 'required' : null;
  const n = Number(v);
  if (!/^\d{1,3}$/.test(v.trim()) || n < 1 || n > 100) return 'Use a number from 1 to 100.';
  return null;
};

export const hasDamage = (d: Draft) => !d.no_damage && d.damage.length > 0;

export const startAmount = (d: Draft) => Number(d.start_price || 0);
export const reserveAmount = (d: Draft) => (d.reserve_on && d.reserve_price ? Number(d.reserve_price) : null);

export const stepDone = (d: Draft, step: number, config: ListingConfig): boolean => {
  const p = profileByKey(d.profile);
  if (step === 1) return !!d.category_key && !!p && d.model.trim().length >= 2;
  if (!p) return false;
  switch (step) {
    case 2: {
      if (p.identifier === 'none') return true;
      if (d.identifier_skipped && !p.identifierRequired) return true;
      const id = normalizeIdentifier(d.identifier, p.identifier);
      if (!id && d.identifier_on_file) return true;
      if (!id || d.checked !== id || !d.check?.valid) return false;
      return !d.check.found || d.found_choice !== null;
    }
    case 3:
      return p.specs.every(f => !specProblem(f, d.specs[f.key])) && p.locks.every(l => d.locks.includes(l));
    case 4:
      return !!d.condition && !batteryProblem(p, d.battery_health) && (d.all_works || d.faults.length > 0);
    case 5: {
      if (!d.opened) return false;
      if (d.opened === 'yes') {
        const ticked = Object.keys(d.parts);
        if (!ticked.length || ticked.some(k => !d.parts[k])) return false;
      }
      if (p.partsHistory && !d.parts_history) return false;
      return d.no_damage || d.damage.length > 0;
    }
    case 6:
      return missingPhotos(p, d.photos, hasDamage(d)).length === 0;
    case 7: {
      const start = startAmount(d);
      if (!start || start < config.min_start_price) return false;
      const reserve = reserveAmount(d);
      if (d.reserve_on && (!reserve || reserve < start)) return false;
      return d.duration_hours > 0;
    }
    default:
      return true;
  }
};

export const firstOpenStep = (d: Draft, config: ListingConfig) => {
  for (let s = 1; s < STEPS; s++) if (!stepDone(d, s, config)) return s;
  return STEPS;
};

/** Switching the kind of device: answers tied to the old one start again. */
export const profileChange = (d: Draft, next: string | null): Partial<Draft> => {
  if (next === d.profile) return {};
  const p = profileByKey(next);
  const keep = p ? new Set(photoSlotsFor(p, true).map(sl => sl.key)) : new Set<string>();
  const photos = Object.fromEntries(Object.entries(d.photos).filter(([k]) => keep.has(k)));
  return {
    profile: next,
    check: null,
    checked: null,
    found_choice: null,
    specs: {},
    from_serial: [],
    locks: [],
    faults: [],
    all_works: false,
    included: [],
    parts: {},
    parts_history: null,
    photos: p && d.legacy_images.length && !Object.keys(photos).length ? placeLegacyImages(p, d.legacy_images, {}) : photos,
  };
};

/** The maker's lookup can fill specs for this profile (and the server has it switched on). */
export const lookupFor = (d: Draft, p: DeviceProfile, config: ListingConfig) =>
  p.identifier !== 'none' && p.specs.some(f => f.fromSerial) && (d.model_lookup ?? config.lookup_available);

/* ---------------- Lookup ---------------- */

const squash = (v: string) => v.toLowerCase().replace(/\s+/g, '');

/** "18GB" → "18 GB" when the field has that option; otherwise the value as read. */
const asOption = (field: SpecField, raw: unknown): string | string[] | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (field.type === 'multi') {
    const list = (Array.isArray(raw) ? raw : [raw]).map(String);
    return list.map(v => field.options?.find(o => squash(o) === squash(v)) ?? v);
  }
  const v = String(raw).trim();
  if (field.type === 'chips') return field.options?.find(o => squash(o) === squash(v)) ?? v;
  return v;
};

/** Puts what the lookup read into the specs. tag=true marks them "From serial". */
export const applyFound = (d: Draft, p: DeviceProfile, found: NonNullable<DeviceCheck['found']>, tag: boolean): Partial<Draft> => {
  const specs = { ...d.specs };
  const from: string[] = [];
  for (const field of p.specs) {
    const v = asOption(field, found.specs?.[field.key]);
    if (v === null || (Array.isArray(v) && !v.length)) continue;
    specs[field.key] = v;
    from.push(field.key);
  }
  return { specs, from_serial: tag ? from : [] };
};

/* ---------------- What we send ---------------- */

const specAnswers = (d: Draft, p: DeviceProfile) => {
  const out: Record<string, unknown> = {};
  for (const f of p.specs) {
    const v = d.specs[f.key];
    if (!filled(v)) continue;
    if (f.type === 'number' || f.type === 'percent') out[f.key] = Number(String(v).replace(/,/g, ''));
    else if (f.type === 'multi') out[f.key] = Array.isArray(v) ? v : [v];
    else out[f.key] = String(v).trim();
  }
  return out;
};

/** The repairs/damage part of the specs, also used for "Buyers will see". */
export const disclosureSpecs = (d: Draft): Partial<ListingSpecs> => ({
  profile: d.profile ?? '',
  repairs: {
    opened: d.opened ?? 'never',
    ...(d.opened === 'yes'
      ? { parts: Object.fromEntries(Object.entries(d.parts).filter((e): e is [string, PartSource] => !!e[1])) }
      : {}),
    ...(d.parts_history ? { parts_history: d.parts_history } : {}),
  },
  damage: d.no_damage ? [] : d.damage,
  faults: d.all_works ? [] : d.faults,
});

export const buildPayload = (d: Draft): ListingPayload => {
  const p = profileByKey(d.profile)!;
  const answers = specAnswers(d, p);
  const id = p.identifier === 'none' || d.identifier_skipped ? '' : normalizeIdentifier(d.identifier, p.identifier);
  const confirmedModel = d.found_choice === 'yes' && d.check?.found ? d.check.found.model : null;
  const slots = photoSlotsFor(p, hasDamage(d)).map(sl => sl.key);
  const extra = disclosureSpecs(d);
  return {
    category_key: d.category_key!,
    model: (confirmedModel ?? d.model).trim(),
    ...(d.model_id ? { model_id: d.model_id } : {}),
    ...(d.brand || p.brand ? { brand: (d.brand || p.brand)! } : {}),
    profile: p.key,
    ...(id ? { identifier: id } : {}),
    specs: {
      ...answers,
      from_serial: d.from_serial.filter(k => k in answers),
      locks_confirmed: true,
      ...(p.batteryHealth && d.battery_health.trim() ? { battery_health: Number(d.battery_health) } : {}),
      faults: extra.faults,
      included: d.included,
      repairs: extra.repairs,
      damage: extra.damage,
    },
    condition: d.condition!,
    photos: Object.fromEntries(slots.filter(k => d.photos[k]).map(k => [k, d.photos[k]])),
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    auction_starting_price: startAmount(d),
    auction_reserve_price: reserveAmount(d),
    auction_duration_hours: d.duration_hours,
    attest: true,
  };
};

/* ---------------- Editing a listing that needs changes ---------------- */

const parseSpecs = (raw: unknown): Record<string, any> => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) ?? {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, any>) : {};
};

const money = (v: unknown) => (Number(v) > 0 ? String(Math.round(Number(v))) : '');
const strList = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

/** Places older images into the profile's slots, in order. */
export const placeLegacyImages = (p: DeviceProfile, images: string[], photos: Record<string, string>) => {
  const out = { ...photos };
  const free = photoSlotsFor(p, false).filter(sl => !out[sl.key]);
  images.slice(0, free.length).forEach((url, i) => (out[free[i].key] = url));
  return out;
};

export const draftFromGadget = (g: Gadget & Record<string, any>): Draft => {
  const s = parseSpecs(g.specifications);
  const p = profileByKey(typeof s.profile === 'string' ? s.profile : null);
  const condition = CONDITION_GRADES.some(c => c.key === g.condition) ? g.condition : null;
  const auction = {
    start_price: money(g.auction_starting_price),
    reserve_on: Number(g.auction_reserve_price) > 0,
    reserve_price: money(g.auction_reserve_price),
    duration_hours: Number(g.auction_duration_hours) > 0 ? Number(g.auction_duration_hours) : 72,
  };

  if (!p) {
    // Older listing: keep what maps, the seller fills the rest.
    const cat0: any = g.category;
    const slug = cat0?.slug ?? g.category_slug ?? (typeof cat0 === 'string' ? cat0 : null);
    const cat = LISTING_CATEGORIES.find(c => c.slug === slug || c.key === slug)?.key ?? null;
    return {
      ...EMPTY_DRAFT,
      category_key: cat,
      model: String(g.model || g.title || '').trim(),
      brand: g.brand ?? null,
      condition,
      legacy_images: strList(g.images),
      ...auction,
    };
  }

  const specs: Record<string, string | string[]> = {};
  for (const f of p.specs) {
    const v = s[f.key];
    if (v === undefined || v === null || v === '') continue;
    specs[f.key] = f.type === 'multi' ? strList(v) : String(v);
  }
  const repairs = (s.repairs ?? {}) as NonNullable<ListingSpecs['repairs']>;
  const damage = strList(s.damage);
  const faults = strList(s.faults);
  const photos =
    s.photos && typeof s.photos === 'object' ? (Object.fromEntries(Object.entries(s.photos).map(([k, v]) => [k, String(v)])) as Record<string, string>) : {};
  return {
    ...EMPTY_DRAFT,
    step: STEPS,
    category_key: (typeof s.category_key === 'string' ? s.category_key : p.category) as ListingCategoryKey,
    model: String(g.model || g.title || '').trim(),
    model_id: typeof s.model_id === 'string' ? s.model_id : null,
    brand: g.brand ?? p.brand ?? null,
    profile: p.key,
    identifier_on_file: typeof s.identifier_masked === 'string' ? s.identifier_masked : null,
    identifier_skipped: !s.identifier_masked && !p.identifierRequired,
    specs,
    from_serial: strList(s.from_serial),
    locks: s.locks_confirmed ? [...p.locks] : [],
    condition,
    battery_health: Number(s.battery_health) > 0 ? String(s.battery_health) : '',
    all_works: Array.isArray(s.faults) && faults.length === 0,
    faults,
    included: strList(s.included),
    note: typeof s.note === 'string' ? s.note : '',
    opened: repairs.opened ?? null,
    parts: repairs.parts ? { ...repairs.parts } : {},
    parts_history: repairs.parts_history ?? null,
    no_damage: Array.isArray(s.damage) && damage.length === 0,
    damage,
    photos: Object.keys(photos).length ? photos : placeLegacyImages(p, strList(g.images), {}),
    ...auction,
  };
};
