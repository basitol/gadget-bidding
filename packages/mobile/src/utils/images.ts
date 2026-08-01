import * as ImageManipulator from 'expo-image-manipulator';
import { resolveMediaUrl, resolveMediaPaths } from '@gadget-bidding/shared';
import { SOCKET_URL } from '../constants/config';

/**
 * Normalize device photos (including iOS HEIC) to JPEG for upload.
 */
export async function toJpegUri(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

export async function toJpegUris(uris: string[]): Promise<string[]> {
  return Promise.all(uris.map(uri => toJpegUri(uri)));
}

/** Resolve API-hosted upload paths for the current device/environment. */
export function mediaUrl(url: string | undefined | null): string {
  return resolveMediaUrl(url, SOCKET_URL);
}

export function mediaUrls(urls: string[] | undefined | null): string[] {
  return resolveMediaPaths(urls, SOCKET_URL);
}
