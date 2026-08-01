/**
 * Normalize stored upload URLs to a stable path (/uploads/...).
 * External URLs (e.g. Unsplash) are returned unchanged.
 */
export function normalizeMediaPath(url: string): string {
  if (!url) return url;

  if (url.startsWith('/uploads/')) {
    return url;
  }

  if (/^https?:\/\//i.test(url)) {
    try {
      const { pathname } = new URL(url);
      if (pathname.startsWith('/uploads/')) {
        return pathname;
      }
    } catch {
      // fall through
    }
    return url;
  }

  return url;
}

/**
 * Resolve a media URL for the current client.
 * - Local uploads: prepend apiOrigin when provided; otherwise keep relative (admin/vite proxy).
 * - External URLs: unchanged.
 */
export function resolveMediaUrl(
  url: string | undefined | null,
  apiOrigin?: string
): string {
  if (!url) return '';

  if (/^https?:\/\//i.test(url)) {
    const path = normalizeMediaPath(url);
    if (path === url) {
      return url;
    }
    url = path;
  }

  if (url.startsWith('/uploads/')) {
    if (!apiOrigin) {
      return url;
    }
    const base = apiOrigin
      .replace(/\/api\/v1\/?$/i, '')
      .replace(/\/$/, '');
    return `${base}${url}`;
  }

  if (url.startsWith('/') && apiOrigin) {
    const base = apiOrigin
      .replace(/\/api\/v1\/?$/i, '')
      .replace(/\/$/, '');
    return `${base}${url}`;
  }

  return url;
}

export function normalizeMediaPaths(urls: string[] | undefined | null): string[] {
  if (!urls?.length) return [];
  return urls.map(normalizeMediaPath);
}

export function resolveMediaPaths(
  urls: string[] | undefined | null,
  apiOrigin?: string
): string[] {
  if (!urls?.length) return [];
  return urls.map(u => resolveMediaUrl(u, apiOrigin)).filter(Boolean);
}
