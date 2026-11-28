import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { PLATFORM_FEE_PERCENTAGE, PLATFORM_FEE_TIERS, type ListingCategoryKey } from '@gadget-bidding/shared';
import api, { getErrorMessage } from './api';
import type { Gadget } from '../types';

/** "List a gadget": the calls behind the 8 steps. */

export type FeeTier = (typeof PLATFORM_FEE_TIERS)[number];

export type ListingConfig = {
  /** Old single rate, kept for older builds. The fee is by price band: use platformFeeFor / fee_tiers. */
  fee_percent: number;
  /** The seller agreement's price bands (what the server charges). */
  fee_tiers: FeeTier[];
  durations_hours: number[];
  lookup_available: boolean;
  max_photos: number;
  min_start_price: number;
};

export const DEFAULT_LISTING_CONFIG: ListingConfig = {
  fee_percent: PLATFORM_FEE_PERCENTAGE,
  fee_tiers: PLATFORM_FEE_TIERS,
  durations_hours: [24, 72, 120, 168],
  lookup_available: false,
  max_photos: 12,
  min_start_price: 1000,
};

/** A model from our list ("iPhone 15 Pro"); picking one sets the device profile. */
export type ModelSuggestion = {
  id: string;
  name: string;
  brand: string | null;
  profile: string;
  category_key: ListingCategoryKey | null;
  lookup_available?: boolean;
};

export type DeviceCheck = {
  valid: boolean;
  message: string | null;
  masked: string | null;
  duplicate: boolean;
  lookup_available: boolean;
  found: null | { model: string; specs: Record<string, unknown>; source: string | null };
};

export type PriceRange = { low: number; high: number; count: number };
export type PriceHint = { similar_repaired: PriceRange | null; all_original: PriceRange | null };

export type ListingPayload = {
  category_key: ListingCategoryKey;
  model: string;
  model_id?: string;
  brand?: string;
  profile: string;
  identifier?: string;
  specs: Record<string, unknown>;
  condition: string;
  photos: Record<string, string>;
  note?: string;
  auction_starting_price: number;
  auction_reserve_price: number | null;
  auction_duration_hours: number;
  attest: true;
};

export type PickedPhoto = { uri: string };

const call = async <T,>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

const toSuggestion = (raw: any): ModelSuggestion | null => {
  const name = str(raw?.name) ?? str(raw?.model) ?? str(raw?.label) ?? str(raw?.title);
  const profile = str(raw?.profile) ?? str(raw?.profile_key);
  if (!name || !profile) return null;
  return {
    id: String(raw?.id ?? `${profile}:${name}`),
    name,
    brand: str(raw?.brand),
    profile,
    category_key: (str(raw?.category_key) ?? str(raw?.category)) as ListingCategoryKey | null,
    lookup_available: typeof raw?.lookup_available === 'boolean' ? raw.lookup_available : undefined,
  };
};

const toRange = (r: any): PriceRange | null =>
  r && Number.isFinite(Number(r.low)) && Number.isFinite(Number(r.high)) && Number(r.high) > 0
    ? { low: Number(r.low), high: Number(r.high), count: Number(r.count) || 0 }
    : null;

/** Big phone photos go up faster (and stay under the server's size limit) at 2,000 px wide. */
const prepare = async (asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> => {
  const actions = asset.width && asset.width > 2000 ? [{ resize: { width: 2000 } }] : [];
  const out = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: out.uri };
};

/** One photo from the library (the system picker only shares what's chosen). */
export const pickListingPhoto = async (): Promise<PickedPhoto | null> => {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (res.canceled || !res.assets?.length) return null;
  return prepare(res.assets[0]);
};

/** Take the photo now (asks for the camera the first time). */
export const takeListingPhoto = async (): Promise<PickedPhoto | null> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow camera access in Settings to take a photo, or choose one instead.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (res.canceled || !res.assets?.length) return null;
  return prepare(res.assets[0]);
};

export const listingService = {
  config: async (): Promise<ListingConfig> => {
    try {
      const c = await call<Partial<ListingConfig>>(api.get('/gadgets/listing-config'));
      return {
        fee_percent: Number.isFinite(Number(c?.fee_percent)) ? Number(c.fee_percent) : DEFAULT_LISTING_CONFIG.fee_percent,
        fee_tiers: Array.isArray(c?.fee_tiers) && c.fee_tiers.length ? c.fee_tiers : DEFAULT_LISTING_CONFIG.fee_tiers,
        durations_hours:
          Array.isArray(c?.durations_hours) && c.durations_hours.length
            ? c.durations_hours.map(Number).filter(n => n > 0)
            : DEFAULT_LISTING_CONFIG.durations_hours,
        lookup_available: !!c?.lookup_available,
        max_photos: Number(c?.max_photos) || DEFAULT_LISTING_CONFIG.max_photos,
        min_start_price: Number(c?.min_start_price) || DEFAULT_LISTING_CONFIG.min_start_price,
      };
    } catch {
      return DEFAULT_LISTING_CONFIG;
    }
  },

  models: async (q: string, category: ListingCategoryKey | null): Promise<ModelSuggestion[]> => {
    const data = await call<any>(api.get('/gadgets/models', { params: { q, ...(category ? { category } : {}) } }));
    const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.models) ? data.models : Array.isArray(data?.items) ? data.items : [];
    return list.map(toSuggestion).filter((m): m is ModelSuggestion => !!m);
  },

  /** A 400/422 is the server saying the number is wrong; anything else (offline, down) throws. */
  deviceCheck: async (body: { profile: string; identifier: string; gadget_id?: string }): Promise<DeviceCheck> => {
    let d: any;
    try {
      d = (await api.post('/gadgets/device-check', body)).data?.data;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 400 || status === 422) {
        return { valid: false, message: getErrorMessage(error), masked: null, duplicate: false, lookup_available: false, found: null };
      }
      throw new Error(getErrorMessage(error));
    }
    const found = d?.found && str(d.found.model) ? { model: String(d.found.model), specs: d.found.specs ?? {}, source: str(d.found.source) } : null;
    return {
      valid: d?.valid !== false,
      message: str(d?.message),
      masked: str(d?.masked),
      duplicate: !!d?.duplicate,
      lookup_available: !!d?.lookup_available,
      found,
    };
  },

  priceHint: async (params: { profile: string; model: string; storage?: string }): Promise<PriceHint> => {
    const d = await call<any>(api.get('/gadgets/price-hint', { params }));
    return { similar_repaired: toRange(d?.similar_repaired), all_original: toRange(d?.all_original) };
  },

  /** Uploads one photo; returns its URL. */
  uploadPhoto: async (photo: PickedPhoto): Promise<string> => {
    const form = new FormData();
    form.append('images', { uri: photo.uri, name: `gadget_${Date.now()}.jpg`, type: 'image/jpeg' } as unknown as Blob);
    const d = await call<{ urls?: string[] }>(
      api.post('/gadgets/upload-images', form, { transformRequest: x => x, timeout: 2 * 60_000 })
    );
    const url = d?.urls?.[0];
    if (!url) throw new Error("That photo didn't upload. Try again.");
    return url;
  },

  create: (payload: ListingPayload) => call<Gadget>(api.post('/gadgets', payload)),
  update: (id: string, payload: ListingPayload) => call<Gadget>(api.put(`/gadgets/${id}`, payload)),
};
