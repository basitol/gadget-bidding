import { resolveMediaUrl, resolveMediaPaths } from '@gadget-bidding/shared';

/** Admin uses Vite proxy for /uploads — relative paths work. */
export function mediaUrl(url: string | undefined | null): string {
  return resolveMediaUrl(url);
}

export function mediaUrls(urls: string[] | undefined | null): string[] {
  return resolveMediaPaths(urls);
}
