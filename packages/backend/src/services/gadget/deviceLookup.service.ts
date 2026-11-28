/**
 * Serial / IMEI lookup for "List a gadget" step 2 ("Let's find the exact model").
 *
 * No maker offers a free lookup, so this is off unless DEVICE_LOOKUP_PROVIDER names an adapter.
 * With it off the app simply asks for the specs (listing-config and device-check report
 * lookup_available: false, found: null). Stolen / blacklist checks stay with the hub inspection.
 *
 * TODO(device-lookup): plugging in a provider
 *   1. Write an adapter below that implements DeviceLookupProvider. `lookup` gets the normalised
 *      identifier (IMEI digits, or the serial in capitals), its kind and the device profile.
 *      Return null when the provider has no record; throw on network / provider errors
 *      (they're logged and the seller just fills the specs in).
 *   2. Map the provider's answer onto the profile's `fromSerial` spec keys, using the exact
 *      option text for chip fields (e.g. storage '256 GB', not '256GB'). toFound() below drops
 *      anything that isn't a fromSerial key of the profile or isn't one of a chip field's options,
 *      so unmapped values never reach the listing.
 *   3. Register it in PROVIDERS under a short name, read its key from env (e.g. DEVICE_LOOKUP_API_KEY,
 *      add it to .env.example), and set DEVICE_LOOKUP_PROVIDER=<name>.
 *   Only send the identifier to the provider (no seller details), and keep the timeout short.
 */
import config from '../../config';
import logger from '../../utils/logger';
import type { DeviceProfile, IdentifierKind } from '@gadget-bidding/shared';

export type DeviceLookupFound = {
  /** e.g. "iPhone 15 Pro" */
  model: string;
  /** Spec answers keyed by the profile's fromSerial SpecField keys. */
  specs: Record<string, string>;
  /** Where it came from, shown to the seller ("From serial"). */
  source: string;
};

export type DeviceLookupRaw = {
  model?: string | null;
  specs?: Record<string, unknown> | null;
};

export interface DeviceLookupProvider {
  /** Shown as `source`. */
  name: string;
  lookup(input: {
    kind: Exclude<IdentifierKind, 'none'>;
    identifier: string;
    profile: DeviceProfile;
  }): Promise<DeviceLookupRaw | null>;
}

const LOOKUP_TIMEOUT_MS = 5_000;

/**
 * Local-only fake so the app's "We found" screen can be tried without a paid service.
 * It picks the first option of each fromSerial chip field. Never used on staging/production.
 */
const mockProvider: DeviceLookupProvider = {
  name: 'Test lookup (not real data)',
  async lookup({ profile }) {
    const fields = profile.specs.filter(f => f.fromSerial);
    if (!fields.length) return null;
    const specs: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === 'chips' && f.options?.length) specs[f.key] = f.options[Math.min(1, f.options.length - 1)];
      else if (f.type === 'text') specs[f.key] = f.placeholder?.replace(/^e\.g\.\s*/i, '') || 'Test value';
    }
    const model =
      profile.key === 'iphone_new'
        ? 'iPhone 15 Pro'
        : profile.key === 'iphone_old'
          ? 'iPhone 13'
          : profile.key === 'macbook_as'
            ? 'MacBook Pro 14-inch (M3 Pro or Max, 2023)'
            : profile.label;
    return { model, specs };
  },
};

const PROVIDERS: Record<string, () => DeviceLookupProvider | null> = {
  none: () => null,
  mock: () => (config.isDeployed ? null : mockProvider),
};

let warned = false;
const provider = (): DeviceLookupProvider | null => {
  const make = PROVIDERS[config.deviceLookupProvider];
  if (!make) {
    if (!warned) {
      logger.warn(`DEVICE_LOOKUP_PROVIDER "${config.deviceLookupProvider}" isn't a known adapter; lookup is off.`);
      warned = true;
    }
    return null;
  }
  return make();
};

export const lookupAvailable = (): boolean => provider() !== null;

const canon = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Keeps only the profile's fromSerial keys, with chip values matched to their option text. */
export const toFound = (profile: DeviceProfile, raw: DeviceLookupRaw | null, source: string): DeviceLookupFound | null => {
  const model = typeof raw?.model === 'string' ? raw.model.trim().slice(0, 100) : '';
  if (!raw || !model) return null;
  const specs: Record<string, string> = {};
  for (const field of profile.specs) {
    if (!field.fromSerial) continue;
    const value = raw.specs?.[field.key];
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const text = String(value).trim();
    if (!text) continue;
    if (field.type === 'chips') {
      const option = field.options?.find(o => canon(o) === canon(text));
      if (option) specs[field.key] = option;
    } else if (field.type === 'text') {
      specs[field.key] = text.slice(0, 120);
    }
  }
  return { model, specs, source };
};

/** Looks the device up; null when lookup is off, nothing was found, or the provider failed. */
export const lookupDevice = async (
  profile: DeviceProfile,
  kind: Exclude<IdentifierKind, 'none'>,
  identifier: string
): Promise<DeviceLookupFound | null> => {
  const p = provider();
  if (!p) return null;
  let timer: NodeJS.Timeout | undefined;
  try {
    const raw = await Promise.race([
      p.lookup({ kind, identifier, profile }),
      new Promise<null>((_, reject) => {
        timer = setTimeout(() => reject(new Error('lookup timed out')), LOOKUP_TIMEOUT_MS);
      }),
    ]);
    return toFound(profile, raw, p.name);
  } catch (error) {
    logger.warn(`Device lookup (${p.name}) failed: ${(error as Error).message}`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
