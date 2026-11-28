import type { DeviceProfile } from '@gadget-bidding/shared';
import type { ListingConfig } from '../../../../services/listing.service';
import type { Draft } from '../draft';
import { useToastStore } from '../../../../store/toastStore';

export type SetDraft = (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void;

export type StepProps = {
  d: Draft;
  set: SetDraft;
  profile: DeviceProfile | undefined;
  config: ListingConfig;
};

/** "IMEI" / "serial number" */
export const idWord = (p: DeviceProfile | undefined) => (p?.identifier === 'imei' ? 'IMEI' : 'serial number');
export const IdWord = (p: DeviceProfile | undefined) => (p?.identifier === 'imei' ? 'IMEI' : 'Serial number');

export const toast = (m: string, t: 'success' | 'error' | 'info' = 'error') => useToastStore.getState().show(m, t);

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");
