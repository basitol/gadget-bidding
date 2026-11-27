import * as ImagePicker from 'expo-image-picker';
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
}

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
