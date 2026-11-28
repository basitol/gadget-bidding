import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import api, { getErrorMessage } from './api';

/** A problem report ("case") as the buyer sees it. */
export interface CaseMessage {
  id: string;
  role: 'buyer' | 'seller' | 'team';
  author: string;
  mine: boolean;
  body: string;
  at: string;
}

export interface CaseReturn {
  method: 'dropoff' | 'pickup';
  code: string;
  status: 'started' | 'received' | 'refunded';
  due_at: string;
  started_at: string;
  received_at: string | null;
  refunded_at: string | null;
  refund_destination: 'card' | 'wallet' | null;
}

export interface Case {
  id: string;
  case_number: string;
  status: string;
  in_review: boolean;
  outcome: 'refund' | 'not_upheld' | null;
  findings: string | null;
  /** Set by our team: what happens next, shown under Team review ("Hub re-test tomorrow"). */
  next_step: string | null;
  decided_at: string | null;
  second_review_requested_at: string | null;
  can_ask_second_review: boolean;
  problem: { type: string; label: string; description: string };
  photos: string[];
  /** One short video the buyer added to the report (mp4/mov). */
  videos: string[];
  /** Seconds for each video (same order; null for older ones). */
  video_lengths?: (number | null)[];
  /** What the hub found, written by our team ("Battery health at hub" · "71%"). */
  hub_findings?: HubFinding[];
  created_at: string;
  timeline: {
    reported_at: string | null;
    seller_replied_at: string | null;
    team_review_at: string | null;
    decided_at: string | null;
  };
  order: {
    id: string;
    order_number: string;
    total_amount: number;
    delivery_fee: number;
    item_amount: number;
    payment_status: string;
    delivery_method: 'delivery' | 'pickup';
    shipping_address?: any;
    paid_with?: string | null;
    gadget: {
      title: string;
      images: string[];
      condition: string;
      brand?: string | null;
      /** From the listing: 'none' | 'seller' | 'manufacturer' | 'applecare' */
      warranty?: string | null;
      /** When a seller or manufacturer warranty ends, YYYY-MM-DD. */
      warranty_until?: string | null;
    } | null;
  };
  messages: CaseMessage[];
  return: CaseReturn | null;
  /** The seller's side. Only in the seller's view of the case. */
  seller?: SellerCaseSide;
}

/* ---------------- The seller's side ---------------- */

export interface HubFinding {
  label: string;
  value: string;
}

/** A file the seller added to their reply. */
export interface SellerCaseFile {
  url: string;
  kind: 'photo' | 'video' | 'pdf';
  name: string;
  seconds?: number;
  added_at: string;
}

export interface SellerCaseSide {
  /** 48 hours from when the case opened. */
  respond_by: string;
  replied_at: string | null;
  position: 'matched' | 'partly' | null;
  position_label: string | null;
  reply: string | null;
  reply_message_id: string | null;
  files: SellerCaseFile[];
  accepted_at: string | null;
  second_review_requested_at: string | null;
  can_reply: boolean;
  can_add_files: boolean;
  can_accept: boolean;
  can_ask_second_review: boolean;
  payout: {
    amount: number;
    /** pending | held | ready | sending | paid */
    status: string | null;
    paid_at: string | null;
    /** The next 6 pm Lagos payout run. */
    next_run_at: string;
    account: { bank_name: string; account_last4: string } | null;
    blocked: 'PAYOUT_ACCOUNT_REQUIRED' | 'TWO_STEP_REQUIRED' | null;
  };
  failed_sales: { count: number; limit: number; window_days: number } | null;
  /** After a refund decision: getting the item back. */
  item_return: {
    method: 'collect' | 'deliver' | null;
    chosen_at: string | null;
    /** Show this (the order number) at the hub. */
    code: string;
    delivery_fee: number;
    free_days: number;
    storage_fee_per_day: number;
    /** The buyer's return: null (not started) | started | received | refunded */
    buyer_return_status: 'started' | 'received' | 'refunded' | null;
    buyer_return_due_at: string | null;
    at_hub_since: string | null;
    free_until: string | null;
    returned_at: string | null;
    charge: { amount: number; status: 'pending' | 'applied' | 'waived' } | null;
    can_choose: boolean;
  } | null;
}

/** A file picked on the phone for the seller's reply, before it's uploaded. */
export interface PickedCaseFile {
  uri: string;
  kind: 'photo' | 'video' | 'pdf';
  name: string;
  mimeType: string;
  seconds?: number;
}

export const SELLER_CASE_FILE_MAX = 6;
export const SELLER_CASE_FILE_MAX_MB = 10;

const tooBig = (size: number | null | undefined, mb: number) => !!size && size > mb * 1024 * 1024;

const photoFrom = (a: ImagePicker.ImagePickerAsset, i: number): PickedCaseFile => {
  if (tooBig(a.fileSize, SELLER_CASE_FILE_MAX_MB)) throw new Error(`That photo is over ${SELLER_CASE_FILE_MAX_MB} MB. Try a smaller one.`);
  const mimeType = a.mimeType || 'image/jpeg';
  const ext = mimeType === 'image/png' ? 'png' : mimeType.includes('heic') ? 'heic' : 'jpg';
  return { uri: a.uri, kind: 'photo', name: a.fileName || `photo-${Date.now()}-${i}.${ext}`, mimeType };
};

/** Photos from the library (several at once). */
export const pickCasePhotos = async (limit: number): Promise<PickedCaseFile[]> => {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsMultipleSelection: limit > 1,
    selectionLimit: Math.max(1, limit),
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (res.canceled || !res.assets?.length) return [];
  return res.assets.slice(0, limit).map(photoFrom);
};

/** A photo from the camera. */
export const takeCasePhoto = async (): Promise<PickedCaseFile[]> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow camera access in Settings to take a photo.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (res.canceled || !res.assets?.length) return [];
  return [photoFrom(res.assets[0], 0)];
};

/** One video, up to 60 seconds (same checks as the buyer's). */
export const pickCaseVideoFile = async (): Promise<PickedCaseFile[]> => {
  const v = await pickCaseVideo();
  if (!v) return [];
  const mov = /\.mov$/i.test(v.fileName || v.uri) || v.mimeType === 'video/quicktime';
  return [
    {
      uri: v.uri,
      kind: 'video',
      name: v.fileName || `video-${Date.now()}${mov ? '.mov' : '.mp4'}`,
      mimeType: mov ? 'video/quicktime' : 'video/mp4',
      seconds: v.seconds,
    },
  ];
};

/** A PDF receipt from Files. */
export const pickCasePdf = async (): Promise<PickedCaseFile[]> => {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return [];
  const a = res.assets[0];
  if (tooBig(a.size, SELLER_CASE_FILE_MAX_MB)) throw new Error(`That PDF is over ${SELLER_CASE_FILE_MAX_MB} MB. Try a smaller one.`);
  return [{ uri: a.uri, kind: 'pdf', name: a.name || `receipt-${Date.now()}.pdf`, mimeType: 'application/pdf' }];
};

/** A video picked on the phone, ready to upload. */
export interface CaseVideo {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

export const CASE_VIDEO_MAX_SECONDS = 60;
export const CASE_VIDEO_MAX_MB = 50;

/** "0:24" */
export const clipLength = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Pick one video from the library (iOS lets them trim it to 60 seconds).
 * Null when they cancel; throws with a message to show when it's too long or too big.
 */
export const pickCaseVideo = async (): Promise<(CaseVideo & { seconds: number }) | null> => {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: true,
    videoMaxDuration: CASE_VIDEO_MAX_SECONDS,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const seconds = a.duration ? a.duration / 1000 : 0;
  if (seconds > CASE_VIDEO_MAX_SECONDS + 1) {
    throw new Error(`That video is ${clipLength(seconds)} long. Pick one that's ${CASE_VIDEO_MAX_SECONDS} seconds or shorter.`);
  }
  if (a.fileSize && a.fileSize > CASE_VIDEO_MAX_MB * 1024 * 1024) {
    throw new Error(`That video is over ${CASE_VIDEO_MAX_MB} MB. Trim it a little and try again.`);
  }
  return { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, seconds };
};

const call = async <T,>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/** The seller's actions on a case. */
export const sellerCaseService = {
  /** position: 'matched' (it matched my listing) | 'partly'; body: 30+ characters. */
  reply: (id: string, position: 'matched' | 'partly', body: string) =>
    call<Case>(api.post(`/cases/${id}/seller-reply`, { position, body })),
  /** One file per call; videos can be up to 50 MB, so it gets a longer timeout. */
  addFile: (id: string, file: PickedCaseFile) => {
    const form = new FormData();
    form.append('name', file.name);
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return call<Case>(api.post(`/cases/${id}/seller-files`, form, { transformRequest: d => d, timeout: 5 * 60_000 }));
  },
  removeFile: (id: string, url: string) => call<Case>(api.delete(`/cases/${id}/seller-files`, { data: { url } })),
  acceptRefund: (id: string) => call<Case>(api.post(`/cases/${id}/accept-refund`)),
  secondReview: (id: string) => call<Case>(api.post(`/cases/${id}/seller-second-review`)),
  chooseReturn: (id: string, method: 'collect' | 'deliver') => call<Case>(api.post(`/cases/${id}/seller-return`, { method })),
};

export const caseService = {
  get: (id: string) => call<Case>(api.get(`/cases/${id}`)),
  message: (id: string, body: string) => call<Case>(api.post(`/cases/${id}/messages`, { body })),
  startReturn: (id: string, method: 'dropoff' | 'pickup') => call<Case>(api.post(`/cases/${id}/return`, { method })),
  secondReview: (id: string) => call<Case>(api.post(`/cases/${id}/second-review`)),
  /** Adds the buyer's video to the report. Up to 50 MB, so it gets a longer timeout. */
  addVideo: (id: string, video: CaseVideo) => {
    const mov = /\.mov$/i.test(video.fileName || video.uri) || video.mimeType === 'video/quicktime';
    const form = new FormData();
    form.append('video', {
      uri: video.uri,
      name: `problem_${Date.now()}${mov ? '.mov' : '.mp4'}`,
      type: mov ? 'video/quicktime' : 'video/mp4',
    } as unknown as Blob);
    return call<Case>(api.post(`/cases/${id}/video`, form, { transformRequest: d => d, timeout: 5 * 60_000 }));
  },
};
