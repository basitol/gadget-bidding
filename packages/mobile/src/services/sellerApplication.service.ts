import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import api, { getErrorMessage } from './api';
import { STORAGE_KEYS } from '../constants';
import type { User } from '../types';

/** A business's application to sell. Our team reviews it by hand. */
export type ApplicationStatus = 'draft' | 'in_review' | 'needs_info' | 'approved' | 'rejected';
export type DocumentKind = 'cac_certificate' | 'owner_id' | 'shop_address';

export interface ApplicationDocument {
  kind: DocumentKind;
  label: string;
  uploaded: boolean;
  name: string | null;
  mime: string | null;
  uploaded_at: string | null;
  status: 'submitted' | 'accepted' | 'needs_fix' | null;
  /** What our team asked for, when the status is needs_fix. */
  note: string | null;
}

export interface SellerApplication {
  status: ApplicationStatus;
  seller_code: string;
  business_name: string | null;
  owner_name: string | null;
  plaza: string | null;
  shop_number: string | null;
  /** "0803 000 0000" */
  business_phone: string | null;
  area: string;
  categories: string[];
  registration_type: 'rc' | 'bn' | null;
  registration_number: string | null;
  number_check: 'pending' | 'matched' | 'not_matched';
  documents: ApplicationDocument[];
  rules_accepted_at: string | null;
  submitted_at: string | null;
  resubmitted_at: string | null;
  decided_at: string | null;
  team_note: string | null;
  reject_reason: string | null;
  second_review_requested_at: string | null;
  can_request_second_review: boolean;
  /** When a turned-down business can start again. */
  reapply_at: string | null;
  approval_seen: boolean;
}

export type ApplicationDetails = Partial<
  Pick<
    SellerApplication,
    'business_name' | 'owner_name' | 'plaza' | 'shop_number' | 'business_phone' | 'categories' | 'registration_number'
  > & { registration_type: 'rc' | 'bn' }
>;

export const SELLER_CATEGORIES = ['Phones', 'Laptops', 'Audio', 'Gaming', 'Wearables', 'Tablets'];
export const SELLER_RULE_KEYS = [
  'platform_fee',
  'hub_dropoff',
  'inspection',
  'paid_after_confirm',
  'name_hidden',
  'cant_buy',
] as const;
export const DOCUMENT_MAX_MB = 10;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
}

const call = async <T,>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

const tooBig = (size?: number | null) => !!size && size > DOCUMENT_MAX_MB * 1024 * 1024;

/** A photo from the library (no permission prompt on iOS: the system picker only shares what's chosen). */
export const pickDocumentPhoto = async (): Promise<PickedFile | null> => {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (tooBig(a.fileSize)) throw new Error(`That photo is over ${DOCUMENT_MAX_MB} MB. Try a smaller one.`);
  const mimeType = a.mimeType || 'image/jpeg';
  const ext = mimeType === 'image/png' ? 'png' : mimeType.includes('heic') ? 'heic' : 'jpg';
  return { uri: a.uri, name: a.fileName || `photo-${Date.now()}.${ext}`, mimeType, size: a.fileSize };
};

/** Take a photo of the document now (asks for the camera the first time). */
export const takeDocumentPhoto = async (): Promise<PickedFile | null> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow camera access in Settings to take a photo, or choose one instead.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (tooBig(a.fileSize)) throw new Error(`That photo is over ${DOCUMENT_MAX_MB} MB. Try again.`);
  return { uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize };
};

/** A PDF from Files. */
export const pickDocumentPdf = async (): Promise<PickedFile | null> => {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (tooBig(a.size)) throw new Error(`That PDF is over ${DOCUMENT_MAX_MB} MB. Try a smaller one.`);
  return { uri: a.uri, name: a.name || `document-${Date.now()}.pdf`, mimeType: a.mimeType || 'application/pdf', size: a.size };
};

export const sellerApplicationService = {
  /* Sign-up (no session yet) */
  signupStart: (email: string) =>
    call<{ verification_id: string; email: string; expires_in: number }>(api.post('/auth/seller/signup/email', { email })),
  signupVerify: (verification_id: string, otp: string) =>
    call<{ verification_id: string; email: string }>(api.post('/auth/seller/signup/verify', { verification_id, otp })),
  signupResend: (verification_id: string) =>
    call<{ expires_in: number }>(api.post('/auth/seller/signup/resend', { verification_id })),

  /** Makes the seller account and keeps the session on this phone. The caller enters the app when the application is sent. */
  signupComplete: async (verification_id: string, password: string): Promise<User> => {
    const session = await call<{ access_token: string; refresh_token: string; user: User }>(
      api.post('/auth/seller/signup/complete', { verification_id, password })
    );
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, session.access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, session.refresh_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(session.user));
      await SecureStore.setItemAsync(STORAGE_KEYS.INTERFACE_TYPE, 'seller');
    } catch {
      throw new Error("Your account is ready, but we couldn't keep you signed in on this phone. Log in to carry on.");
    }
    return session.user;
  },

  /* The application (signed in) */
  get: () => call<SellerApplication>(api.get('/seller/application')),
  /** The account fresh from the server; also saved on this phone for the next launch. */
  account: async (): Promise<User> => {
    const user = await call<User>(api.get('/seller/application/account'));
    await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user)).catch(() => {});
    return user;
  },
  update: (details: ApplicationDetails) => call<SellerApplication>(api.put('/seller/application', details)),
  uploadDocument: (kind: DocumentKind, file: PickedFile) => {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return call<SellerApplication>(
      api.post(`/seller/application/documents/${kind}`, form, { transformRequest: d => d, timeout: 2 * 60_000 })
    );
  },
  submit: () => call<SellerApplication>(api.post('/seller/application/submit', { rules: [...SELLER_RULE_KEYS] })),
  resubmit: () => call<SellerApplication>(api.post('/seller/application/resubmit')),
  secondReview: () => call<SellerApplication>(api.post('/seller/application/second-review')),
  reapply: () => call<SellerApplication>(api.post('/seller/application/reapply')),
  markSeen: () => call<SellerApplication>(api.post('/seller/application/seen')),
};
