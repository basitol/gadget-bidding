/**
 * The seller's 8-step "List a gadget" flow, server side.
 *
 * The app renders each step from the device profile (shared/src/deviceProfiles.ts) and this file
 * validates the same rules: required specs, every lock confirmed, repairs answered with a source for
 * each changed part, the profile's required photos, the IMEI / serial, the seller's statement and
 * the auction prices. The listing then goes to our team's review (approveGadget / rejectGadget).
 *
 * The full IMEI / serial is saved in gadgets.device_identifier (staff only) with a hash for
 * duplicate checks; specifications only ever carry identifier_masked.
 */
import crypto from 'crypto';
import { query, transaction } from '../../config/database';
import config from '../../config';
import logger from '../../utils/logger';
import {
  CONDITION_GRADES,
  DAMAGE_OPTIONS,
  LISTING_CATEGORIES,
  PARTS_HISTORY_OPTIONS,
  PLATFORM_FEE_TIERS,
  PART_SOURCES,
  isValidImei,
  listingDisclosures,
  maskIdentifier,
  missingPhotos,
  normalizeMediaPath,
  photoSlotsFor,
  profileByKey,
  type DeviceProfile,
  type PhotoSlot,
  type SpecField,
} from '@gadget-bidding/shared';
import * as notificationService from '../notification/notification.service';
import { getModel, getModelByName } from './deviceModels.service';
import { lookupAvailable, lookupDevice, type DeviceLookupFound } from './deviceLookup.service';

export const LISTING_DURATIONS_HOURS = [24, 72, 120, 168] as const;
export const MAX_LISTING_PHOTOS = 12;
export const MIN_START_PRICE = 1000;
const MAX_PRICE = 100_000_000;

/** A 400 with a plain message naming what's missing ("Add a photo of the battery health screen."). */
export class ListingInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
function bad(message: string): never {
  throw new ListingInputError(message);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export const listingConfig = () => ({
  /** Old app builds show one rate; current ones use fee_tiers (fee by price band). */
  fee_percent: config.platformFeePercentage,
  fee_tiers: PLATFORM_FEE_TIERS,
  durations_hours: [...LISTING_DURATIONS_HOURS],
  lookup_available: lookupAvailable(),
  max_photos: MAX_LISTING_PHOTOS,
  min_start_price: MIN_START_PRICE,
});

/* ------------------------------------------------------------------ */
/* IMEI / serial                                                       */
/* ------------------------------------------------------------------ */

export type IdentifierCheck = { valid: boolean; message: string | null; normalized: string; masked: string };

const identifierName = (profile: DeviceProfile) => (profile.identifier === 'imei' ? 'IMEI' : 'serial number');

/** IMEI: the 15 digits. Serial: letters and digits in capitals, without spaces or dashes. */
export const normalizeIdentifier = (profile: DeviceProfile, raw: string) =>
  profile.identifier === 'imei' ? raw.replace(/[\s\-/.]/g, '') : raw.replace(/[\s\-/.]/g, '').toUpperCase();

export const hashIdentifier = (normalized: string) => crypto.createHash('sha256').update(normalized).digest('hex');

export const checkIdentifier = (profile: DeviceProfile, raw: unknown): IdentifierCheck => {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const normalized = normalizeIdentifier(profile, text);
  const masked = normalized ? maskIdentifier(normalized) : '';
  const fail = (message: string): IdentifierCheck => ({ valid: false, message, normalized, masked });
  if (profile.identifier === 'none') return { valid: true, message: null, normalized: '', masked: '' };
  if (!normalized) return fail(`Add the ${identifierName(profile)}.`);
  if (profile.identifier === 'imei') {
    if (!/^\d+$/.test(normalized)) return fail('An IMEI is only numbers. Dial *#06# to see it.');
    if (normalized.length !== 15) return fail(`An IMEI has 15 digits. This one has ${normalized.length}.`);
    if (!isValidImei(normalized)) return fail('That IMEI doesn’t look right. Check each digit and try again.');
  } else {
    if (!/^[A-Z0-9]+$/.test(normalized)) return fail('A serial number only has letters and numbers.');
    if (normalized.length < 8 || normalized.length > 20)
      return fail('A serial number is 8 to 20 letters and numbers. Check it and try again.');
  }
  return { valid: true, message: null, normalized, masked };
};

/**
 * Is this device on another seller's listing that's waiting or live, or on anything sold in the
 * last 90 days? Never says whose.
 */
export const isDuplicateIdentifier = async (hash: string, sellerId: string, gadgetId?: string | null) => {
  const [row] = await query<{ duplicate: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM gadgets g
       WHERE g.device_identifier_hash = $1
         AND ($3::uuid IS NULL OR g.id <> $3::uuid)
         AND (
           (g.seller_id IS DISTINCT FROM $2::uuid AND g.status IN ('pending', 'approved', 'listed'))
           OR EXISTS (
             SELECT 1 FROM auctions a JOIN orders o ON o.auction_id = a.id
             WHERE a.gadget_id = g.id
               AND o.payment_status = 'paid'
               AND o.fulfillment_status IS DISTINCT FROM 'cancelled'
               AND o.created_at >= NOW() - INTERVAL '90 days'
           )
         )
     ) AS duplicate`,
    [hash, sellerId, gadgetId ?? null]
  );
  return !!row?.duplicate;
};

export const deviceCheck = async (
  sellerId: string,
  body: { profile?: unknown; identifier?: unknown; gadget_id?: unknown }
): Promise<{
  valid: boolean;
  message: string | null;
  masked: string;
  duplicate: boolean;
  lookup_available: boolean;
  found: DeviceLookupFound | null;
}> => {
  const profile = profileByKey(typeof body.profile === 'string' ? body.profile : null);
  if (!profile) bad('Pick what kind of device it is.');
  if (body.identifier != null && typeof body.identifier !== 'string') bad('Send the IMEI or serial number as text.');
  const gadgetId = body.gadget_id == null || body.gadget_id === '' ? null : body.gadget_id;
  if (gadgetId !== null && (typeof gadgetId !== 'string' || !UUID.test(gadgetId))) bad('That listing id isn’t right.');

  const p = profile as DeviceProfile;
  const check = checkIdentifier(p, body.identifier);
  const available = lookupAvailable();
  if (!check.valid || p.identifier === 'none') {
    return { valid: check.valid, message: check.message, masked: check.masked, duplicate: false, lookup_available: available, found: null };
  }
  const [duplicate, found] = await Promise.all([
    isDuplicateIdentifier(hashIdentifier(check.normalized), sellerId, gadgetId as string | null),
    lookupDevice(p, p.identifier, check.normalized),
  ]);
  return { valid: true, message: null, masked: check.masked, duplicate, lookup_available: available, found };
};

/* ------------------------------------------------------------------ */
/* Price hint                                                          */
/* ------------------------------------------------------------------ */

type Range = { low: number; high: number; count: number } | null;

const round5k = (n: number) => Math.max(5000, Math.round(n / 5000) * 5000);
const rangeOf = (prices: number[]): Range =>
  prices.length >= 2 ? { low: round5k(Math.min(...prices)), high: round5k(Math.max(...prices)), count: prices.length } : null;

/** "Similar items sold for": our own paid sales in the last 180 days, with and without replaced parts. */
export const priceHint = async (params: { profile?: unknown; model?: unknown; storage?: unknown }) => {
  const profile = profileByKey(typeof params.profile === 'string' ? params.profile : null);
  if (!profile) bad('Pick what kind of device it is.');
  const model = typeof params.model === 'string' ? params.model.trim() : '';
  if (model.length < 2) bad('Add the model, e.g. iPhone 15 Pro.');
  const storage = typeof params.storage === 'string' && params.storage.trim() ? params.storage.trim() : null;

  const rows = await query<{ price: string; specifications: any }>(
    `SELECT (o.total_amount - COALESCE(o.delivery_fee, 0)) AS price, g.specifications
     FROM orders o
     JOIN auctions a ON a.id = o.auction_id
     JOIN gadgets g ON g.id = a.gadget_id
     WHERE o.payment_status = 'paid'
       AND o.fulfillment_status IS DISTINCT FROM 'cancelled'
       AND o.created_at >= NOW() - INTERVAL '180 days'
       AND g.specifications->>'profile' = $1
       AND lower(trim(g.model)) = lower($2)
       AND ($3::text IS NULL OR lower(g.specifications->>'storage') = lower($3::text))`,
    [(profile as DeviceProfile).key, model, storage]
  );
  const repaired: number[] = [];
  const original: number[] = [];
  for (const r of rows) {
    const price = Number(r.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const replaced = listingDisclosures(r.specifications).some(d => d.label.includes(' replaced · '));
    (replaced ? repaired : original).push(price);
  }
  return { similar_repaired: rangeOf(repaired), all_original: rangeOf(original) };
};

/* ------------------------------------------------------------------ */
/* The listing body                                                    */
/* ------------------------------------------------------------------ */

/** "Storage" → "storage", but "SIM" / "CPU / GPU cores" stay as they are. */
const lowerFirst = (label: string) => (/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label);

const PHOTO_ASKS: Record<string, string> = {
  'Open, screen on': 'Add a photo of it open, with the screen on.',
  'Screen on': 'Add a photo of it with the screen on.',
  'Switched on': 'Add a photo of it switched on.',
  'Switched on (home screen)': 'Add a photo of it switched on, on the home screen.',
  'Close-up of damage': 'Add a close-up photo of the damage.',
  'In the case / on the stand': 'Add a photo of them in the case or on the stand.',
  'Each side up close': 'Add a close-up photo of each side.',
  'In the case': 'Add a photo of them in the case.',
  'Inside (side panel off)': 'Add a photo of the inside, with the side panel off.',
  'About This Mac': 'Add a photo of the About This Mac window.',
  'Settings → About (specs)': 'Add a photo of Settings → About, showing the specs.',
  'Battery report or health': 'Add a photo of the battery report or battery health.',
};
const KEEP_CASE = /^(About|Settings|Parts|System Information)\b/;
export const photoAsk = (slot: PhotoSlot) =>
  PHOTO_ASKS[slot.label] ?? `Add a photo of the ${KEEP_CASE.test(slot.label) ? slot.label : lowerFirst(slot.label)}.`;

const canon = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const isBlank = (v: unknown) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() && /^-?[\d,]*\.?\d+$/.test(v.trim())) return Number(v.trim().replace(/,/g, ''));
  return null;
};

/** One spec answer, checked against its field. undefined = not answered. */
const specAnswer = (field: SpecField, raw: unknown): unknown => {
  if (isBlank(raw)) {
    if (field.required) bad(field.type === 'chips' || field.type === 'multi' ? `Pick the ${lowerFirst(field.label)}.` : `Add the ${lowerFirst(field.label)}.`);
    return undefined;
  }
  switch (field.type) {
    case 'chips': {
      const option = typeof raw === 'string' ? field.options?.find(o => canon(o) === canon(raw)) : undefined;
      return option ?? bad(`Pick one of the ${field.label} options.`);
    }
    case 'multi': {
      const list = Array.isArray(raw) ? raw : [raw];
      const picked = list.map(v => (typeof v === 'string' ? field.options?.find(o => canon(o) === canon(v)) : undefined));
      if (picked.some(p => !p)) bad(`Pick from the ${field.label} options.`);
      return Array.from(new Set(picked as string[]));
    }
    case 'number': {
      const n = toNumber(raw);
      if (n === null || n < 0 || n > 10_000_000) bad(`${field.label} has to be a number.`);
      return n;
    }
    case 'percent': {
      const n = toNumber(raw);
      if (n === null || n < 0 || n > 100) bad(`${field.label} is a percentage from 0 to 100.`);
      return Math.round(n as number);
    }
    default: {
      if (typeof raw !== 'string' && typeof raw !== 'number') bad(`Add the ${lowerFirst(field.label)} as text.`);
      const text = String(raw).replace(/\s+/g, ' ').trim();
      if (text.length > 120) bad(`Keep ${lowerFirst(field.label)} under 120 characters.`);
      return text;
    }
  }
};

const pickKeys = (raw: unknown, allowed: { key: string }[]) => {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const keys = new Set(allowed.map(o => o.key));
  return Array.from(new Set(raw.filter((k): k is string => typeof k === 'string' && keys.has(k))));
};

const price = (raw: unknown, what: string): number => {
  const n = toNumber(raw);
  if (n === null) return bad(`Add ${what}.`);
  return Math.round(n);
};

export type ListingBody = {
  category_key?: unknown;
  model?: unknown;
  model_id?: unknown;
  brand?: unknown;
  profile?: unknown;
  identifier?: unknown;
  specs?: unknown;
  condition?: unknown;
  photos?: unknown;
  note?: unknown;
  auction_starting_price?: unknown;
  auction_reserve_price?: unknown;
  auction_duration_hours?: unknown;
  attest?: unknown;
};

type Prepared = {
  categoryId: string;
  brand: string;
  model: string;
  title: string;
  description: string;
  condition: string;
  specifications: Record<string, unknown>;
  images: string[];
  identifier: string | null;
  identifierHash: string | null;
  startingPrice: number;
  reservePrice: number | null;
  durationHours: number;
  attestedAt: Date;
};

/** Checks the body step by step (first problem wins) and builds what's saved. */
export const prepareListing = async (
  body: ListingBody,
  existing?: { device_identifier: string | null; profile: string | null }
): Promise<Prepared> => {
  // 1 · Category and model
  const category = LISTING_CATEGORIES.find(c => c.key === body.category_key);
  if (!category) bad('Pick a category.');
  const profile = profileByKey(typeof body.profile === 'string' ? body.profile : null) as DeviceProfile;
  if (!profile) bad('Pick what kind of device it is.');
  if (profile.category !== category!.key && profile.key !== 'other')
    bad('That kind of device doesn’t go in this category. Pick the category again.');
  const typed = typeof body.model === 'string' ? body.model.replace(/\s+/g, ' ').trim() : '';
  if (typed.length < 2) bad('Add the model, e.g. iPhone 15 Pro.');
  if (typed.length > 100) bad('Keep the model under 100 characters.');
  const modelRow =
    (typeof body.model_id === 'string' && UUID.test(body.model_id) ? await getModel(body.model_id) : null) ??
    (await getModelByName(typed));
  // "galaxy tab a9+" → "Galaxy Tab A9+" when it's one of our models.
  const model = modelRow && modelRow.name.toLowerCase() === typed.toLowerCase() ? modelRow.name : typed;
  if (body.brand != null && typeof body.brand !== 'string') bad('Add the brand as text.');
  const brandIn = typeof body.brand === 'string' ? body.brand.replace(/\s+/g, ' ').trim() : '';
  if (brandIn.length > 100) bad('Keep the brand under 100 characters.');
  const brand = brandIn || modelRow?.brand || profile.brand || model.split(' ')[0];

  const [cat] = await query<{ id: string }>('SELECT id FROM gadget_categories WHERE slug = $1', [category!.slug]);
  if (!cat) bad('That category isn’t open for listings yet. Pick another one.');

  // 2 · IMEI / serial (on an edit, leaving it out keeps the one we have)
  let identifier: IdentifierCheck | null = null;
  if (profile.identifier !== 'none') {
    const sent = typeof body.identifier === 'string' && body.identifier.trim() ? body.identifier : null;
    if (body.identifier != null && typeof body.identifier !== 'string') bad(`Add the ${identifierName(profile)} as text.`);
    // Only an identifier of the same kind carries over (an IMEI isn't a serial number).
    const kept =
      existing?.device_identifier && profileByKey(existing.profile)?.identifier === profile.identifier
        ? existing.device_identifier
        : null;
    const raw = sent ?? kept;
    if (raw) {
      identifier = checkIdentifier(profile, raw);
      if (!identifier.valid) bad(identifier.message!);
    } else if (profile.identifierRequired) {
      bad(`Add the ${identifierName(profile)}.`);
    }
  }

  // 3 · Specs and locks
  if (body.specs == null || typeof body.specs !== 'object' || Array.isArray(body.specs)) bad('Add the specs.');
  const specs = body.specs as Record<string, any>;
  const answers: Record<string, unknown> = {};
  for (const field of profile.specs) {
    const v = specAnswer(field, specs[field.key]);
    if (v !== undefined) answers[field.key] = v;
  }
  const fromSerial = Array.isArray(specs.from_serial)
    ? Array.from(
        new Set(
          (specs.from_serial as unknown[]).filter(
            (k): k is string => typeof k === 'string' && profile.specs.some(f => f.key === k && f.fromSerial) && k in answers
          )
        )
      )
    : [];
  if (profile.locks.length) {
    const lc = specs.locks_confirmed;
    const all =
      lc === true ||
      (Array.isArray(lc) && profile.locks.every((l, i) => lc.includes(l) || lc.includes(i)));
    if (!all) bad(`Confirm every lock statement: ${profile.locks.join('; ')}.`);
  }

  // 4 · Condition (and battery health, faults, what's in the box)
  const grade = CONDITION_GRADES.find(g => g.key === body.condition);
  if (!grade) bad('Pick the condition.');
  let batteryHealth: number | undefined;
  if (profile.batteryHealth && !isBlank(specs.battery_health)) {
    const n = toNumber(specs.battery_health);
    if (n === null || n < 1 || n > 100) bad('Battery health is a percentage from 1 to 100.');
    batteryHealth = Math.round(n as number);
  }
  const faults = pickKeys(specs.faults, profile.faults);
  const included = pickKeys(specs.included, profile.inBox);

  // 5 · Repairs and damage
  const repairsIn = specs.repairs;
  if (!repairsIn || typeof repairsIn !== 'object' || !['never', 'yes', 'not_sure'].includes(repairsIn.opened))
    bad('Say whether it has ever been opened or repaired.');
  const repairs: Record<string, unknown> = { opened: repairsIn.opened };
  if (repairsIn.opened !== 'never' && repairsIn.parts != null) {
    if (typeof repairsIn.parts !== 'object' || Array.isArray(repairsIn.parts)) bad('Say which parts were changed.');
    const parts: Record<string, string> = {};
    for (const [key, source] of Object.entries(repairsIn.parts as Record<string, unknown>)) {
      const part = profile.parts.find(p => p.key === key);
      if (!part) bad('One of the changed parts isn’t one we know for this device. Pick the parts again.');
      if (!PART_SOURCES.some(s => s.key === source))
        bad(`Say whether the new ${lowerFirst(part!.label.split(' / ')[0])} is genuine or a replacement part.`);
      parts[key] = source as string;
    }
    if (Object.keys(parts).length) repairs.parts = parts;
  }
  if (profile.partsHistory && !isBlank(repairsIn.parts_history)) {
    if (!PARTS_HISTORY_OPTIONS.some(o => o.key === repairsIn.parts_history))
      bad('Pick what Parts & Service History shows.');
    repairs.parts_history = repairsIn.parts_history;
  }
  const damage = pickKeys(specs.damage, DAMAGE_OPTIONS);
  const hasDamage = damage.length > 0;

  // 6 · Photos, in the profile's slot order
  if (body.photos == null || typeof body.photos !== 'object' || Array.isArray(body.photos)) bad('Add the photos.');
  const photosIn = body.photos as Record<string, unknown>;
  const photos: Record<string, string> = {};
  for (const slot of photoSlotsFor(profile, hasDamage)) {
    const url = photosIn[slot.key];
    if (isBlank(url)) continue;
    if (typeof url !== 'string' || url.length > 2048 || !(/^https?:\/\//i.test(url) || url.startsWith('/uploads/')))
      bad(`The ${lowerFirst(slot.label)} photo didn’t upload properly. Add it again.`);
    photos[slot.key] = normalizeMediaPath((url as string).trim());
  }
  const missing = missingPhotos(profile, photos, hasDamage);
  if (missing.length) bad(photoAsk(missing[0]));
  const images = photoSlotsFor(profile, hasDamage)
    .map(s => photos[s.key])
    .filter(Boolean);
  if (images.length > MAX_LISTING_PHOTOS) bad(`Add up to ${MAX_LISTING_PHOTOS} photos.`);

  if (body.note != null && typeof body.note !== 'string') bad('Write your note as text.');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000) bad('Keep your note under 1,000 characters.');

  // 7 · Auction
  const startingPrice = price(body.auction_starting_price, 'a starting price');
  if (startingPrice < MIN_START_PRICE) bad('The starting price has to be at least ₦1,000.');
  if (startingPrice > MAX_PRICE) bad('That starting price is too high. Check it and try again.');
  let reservePrice: number | null = null;
  if (!isBlank(body.auction_reserve_price) && toNumber(body.auction_reserve_price) !== 0) {
    reservePrice = price(body.auction_reserve_price, 'your lowest price');
    if (reservePrice < startingPrice) bad('Your hidden lowest price has to be at or above the starting price.');
    if (reservePrice > MAX_PRICE) bad('That lowest price is too high. Check it and try again.');
  }
  const durationHours = toNumber(body.auction_duration_hours);
  if (durationHours === null || !(LISTING_DURATIONS_HOURS as readonly number[]).includes(durationHours))
    bad('Pick how long the auction runs: 1, 3, 5 or 7 days.');

  // 8 · The seller's statement
  if (body.attest !== true) bad('Confirm the item is yours to sell and the details are true.');
  const attestedAt = new Date();

  const specifications: Record<string, unknown> = {
    profile: profile.key,
    ...answers,
    from_serial: fromSerial,
    locks_confirmed: true,
    ...(batteryHealth !== undefined ? { battery_health: batteryHealth } : {}),
    faults,
    included,
    repairs,
    damage,
    photos,
    ...(identifier?.normalized ? { identifier_masked: identifier.masked } : {}),
    ...(note ? { note } : {}),
    ...(modelRow ? { model_id: modelRow.id } : {}),
    attested_at: attestedAt.toISOString(),
  };

  const title = buildTitle(model, answers);
  return {
    categoryId: cat!.id,
    brand: brand.slice(0, 100),
    model,
    title,
    description: buildDescription(profile, title, grade!, answers, specifications, note),
    condition: grade!.key,
    specifications,
    images,
    identifier: identifier?.normalized || null,
    identifierHash: identifier?.normalized ? hashIdentifier(identifier.normalized) : null,
    startingPrice,
    reservePrice,
    durationHours: durationHours as number,
    attestedAt,
  };
};

/** "iPhone 15 Pro · 256 GB · Natural Titanium" */
export const buildTitle = (model: string, answers: Record<string, unknown>) => {
  const size = answers.storage ?? answers.size;
  return [model, size, answers.colour]
    .filter((v): v is string => typeof v === 'string' && !!v.trim())
    .join(' · ')
    .slice(0, 200);
};

const fmtSpec = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v));

/** A plain description buyers can read, built from the answers and the seller's note. */
export const buildDescription = (
  profile: DeviceProfile,
  title: string,
  grade: { label: string; help: string },
  answers: Record<string, unknown>,
  specs: Record<string, any>,
  note: string
) => {
  const label = (list: { key: string; label: string }[], key: string) => list.find(o => o.key === key)?.label ?? key;
  const lines: string[] = [title, `Condition: ${grade.label}. ${grade.help}`];
  const specLine = profile.specs
    .filter(f => answers[f.key] !== undefined)
    .map(f => `${f.label}: ${fmtSpec(answers[f.key])}`)
    .join(' · ');
  if (specLine) lines.push(specLine);
  if (typeof specs.battery_health === 'number') lines.push(`Battery health: ${specs.battery_health}%`);

  const repairs = specs.repairs ?? {};
  const changed = Object.entries((repairs.parts ?? {}) as Record<string, string>).map(
    ([k, s]) =>
      `${label(profile.parts, k).split(' / ')[0]} replaced (${s === 'genuine' ? 'genuine part' : s === 'replacement' ? 'non-genuine part' : 'part not known'})`
  );
  if (repairs.opened === 'never') lines.push('Never opened or repaired.');
  else if (repairs.opened === 'not_sure') lines.push(`The seller isn’t sure if it was ever opened.${changed.length ? ` ${changed.join(', ')}.` : ''}`);
  else lines.push(changed.length ? `Repairs: ${changed.join(', ')}.` : 'Opened before, no parts changed.');
  if (repairs.parts_history === 'unknown_part') lines.push('Parts & Service History shows "Unknown Part".');
  else if (repairs.parts_history === 'genuine') lines.push('Parts & Service History shows genuine parts only.');

  lines.push(specs.damage?.length ? `Damage: ${specs.damage.map((d: string) => label(DAMAGE_OPTIONS, d)).join(', ')}.` : 'No damage reported.');
  if (specs.faults?.length) lines.push(`Not working: ${specs.faults.map((f: string) => label(profile.faults, f)).join(', ')}.`);
  if (specs.included?.length) lines.push(`Comes with: ${specs.included.map((i: string) => label(profile.inBox, i)).join(', ')}.`);
  if (note) lines.push(`Seller’s note: ${note}`);
  return lines.join('\n').slice(0, 5000);
};

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

export const createListing = async (sellerId: string, body: ListingBody): Promise<string> => {
  const p = await prepareListing(body);
  const [row] = await query<{ id: string; title: string }>(
    `INSERT INTO gadgets
     (seller_id, category_id, title, description, brand, model, condition, specifications, images, status,
      auction_starting_price, auction_reserve_price, auction_buy_now_price, auction_bid_increment,
      auction_duration_hours, auction_start_now, device_identifier, device_identifier_hash, seller_attested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, NULL, NULL, $12, true, $13, $14, $15)
     RETURNING id, title`,
    [
      sellerId,
      p.categoryId,
      p.title,
      p.description,
      p.brand,
      p.model,
      p.condition,
      JSON.stringify(p.specifications),
      p.images,
      p.startingPrice,
      p.reservePrice,
      p.durationHours,
      p.identifier,
      p.identifierHash,
      p.attestedAt,
    ]
  );
  logger.info(`Gadget created (listing flow): ${row.id} by ${sellerId} (profile=${p.specifications.profile})`);
  notificationService.notifyBackofficeGadgetSubmitted(row.id, row.title).catch(error => {
    logger.error('Failed to notify backoffice about gadget submission:', error);
  });
  return row.id;
};

/** Editing a listing that's waiting for review or was sent back puts it back in the queue. */
export const updateListing = async (gadgetId: string, sellerId: string, body: ListingBody): Promise<string> => {
  return transaction(async client => {
    const found = await client.query(
      `SELECT id, status, device_identifier, specifications->>'profile' AS profile
       FROM gadgets WHERE id = $1 AND seller_id = $2 FOR UPDATE`,
      [gadgetId, sellerId]
    );
    if (!found.rows.length) throw new ListingInputError('We couldn’t find that listing.', 404);
    const g = found.rows[0];
    if (g.status !== 'pending' && g.status !== 'rejected')
      throw new ListingInputError('You can only change a listing while it’s waiting for review or was sent back.');
    const p = await prepareListing(body, { device_identifier: g.device_identifier, profile: g.profile });
    await client.query(
      `UPDATE gadgets SET
         category_id = $3, title = $4, description = $5, brand = $6, model = $7, condition = $8,
         specifications = $9, images = $10, auction_starting_price = $11, auction_reserve_price = $12,
         auction_buy_now_price = NULL, auction_bid_increment = NULL, auction_duration_hours = $13,
         auction_start_now = true, device_identifier = $14, device_identifier_hash = $15, seller_attested_at = $16,
         status = 'pending', rejection_reason = NULL, updated_at = NOW()
       WHERE id = $1 AND seller_id = $2`,
      [
        gadgetId,
        sellerId,
        p.categoryId,
        p.title,
        p.description,
        p.brand,
        p.model,
        p.condition,
        JSON.stringify(p.specifications),
        p.images,
        p.startingPrice,
        p.reservePrice,
        p.durationHours,
        p.identifier,
        p.identifierHash,
        p.attestedAt,
      ]
    );
    logger.info(`Gadget updated (listing flow): ${gadgetId}`);
    return gadgetId;
  });
};

/* ------------------------------------------------------------------ */
/* Staff review                                                        */
/* ------------------------------------------------------------------ */

/** Other listings and sales with the same IMEI / serial (staff only: says whose). */
export const identifierMatches = async (gadgetId: string, hash: string | null, sellerId: string | null) => {
  if (!hash) return { duplicate: false, matches: [] as any[] };
  const rows = await query(
    `SELECT g.id, g.title, g.status, g.created_at, g.seller_id, u.full_name AS seller_name,
            (g.seller_id IS NOT DISTINCT FROM $3::uuid) AS same_seller,
            sale.sold_at
     FROM gadgets g
     LEFT JOIN users u ON u.id = g.seller_id
     LEFT JOIN LATERAL (
       SELECT MAX(o.created_at) AS sold_at FROM auctions a JOIN orders o ON o.auction_id = a.id
       WHERE a.gadget_id = g.id AND o.payment_status = 'paid' AND o.fulfillment_status IS DISTINCT FROM 'cancelled'
     ) sale ON true
     WHERE g.device_identifier_hash = $1 AND g.id <> $2
     ORDER BY g.created_at DESC
     LIMIT 10`,
    [hash, gadgetId, sellerId]
  );
  const ninetyDays = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const matches = rows.map((r: any) => {
    const soldRecently = !!r.sold_at && new Date(r.sold_at).getTime() >= ninetyDays;
    const otherSellerLive = !r.same_seller && ['pending', 'approved', 'listed'].includes(r.status);
    return {
      gadget_id: r.id,
      title: r.title,
      status: r.status,
      created_at: new Date(r.created_at).toISOString(),
      seller_id: r.seller_id,
      seller_name: r.seller_name,
      same_seller: !!r.same_seller,
      sold_at: r.sold_at ? new Date(r.sold_at).toISOString() : null,
      counts_as_duplicate: soldRecently || otherSellerLive,
    };
  });
  return { duplicate: matches.some(m => m.counts_as_duplicate), matches };
};

/** For a page of admin rows: which ones share their IMEI / serial with another seller's live listing or a recent sale. */
export const duplicateFlags = async (gadgetIds: string[]): Promise<Set<string>> => {
  if (!gadgetIds.length) return new Set();
  const rows = await query<{ id: string }>(
    `SELECT g.id FROM gadgets g
     WHERE g.id = ANY($1::uuid[]) AND g.device_identifier_hash IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM gadgets o
         WHERE o.device_identifier_hash = g.device_identifier_hash AND o.id <> g.id
           AND (
             (o.seller_id IS DISTINCT FROM g.seller_id AND o.status IN ('pending', 'approved', 'listed'))
             OR EXISTS (
               SELECT 1 FROM auctions a JOIN orders ord ON ord.auction_id = a.id
               WHERE a.gadget_id = o.id AND ord.payment_status = 'paid'
                 AND ord.fulfillment_status IS DISTINCT FROM 'cancelled'
                 AND ord.created_at >= NOW() - INTERVAL '90 days'
             )
           )
       )`,
    [gadgetIds]
  );
  return new Set(rows.map(r => r.id));
};

/** The hashes an admin search term could be (IMEI digits, or a serial in capitals). */
export const identifierSearchHashes = (term: string): string[] => {
  const t = term.trim();
  if (t.length < 8) return [];
  const compact = t.replace(/[\s\-/.]/g, '');
  return Array.from(new Set([compact, compact.toUpperCase()].filter(v => /^[A-Z0-9]{8,20}$/i.test(v)).map(hashIdentifier)));
};
