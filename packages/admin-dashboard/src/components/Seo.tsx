import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PAGES,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  absoluteUrl,
  documentTitle,
} from '@/lib/site';

function upsertMeta(
  attr: 'name' | 'property',
  key: string,
  content: string
) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

type SeoProps = {
  title?: string;
  description?: string;
  path?: string;
  noindex?: boolean;
  image?: string;
};

export function Seo({
  title,
  description,
  path,
  noindex,
  image = '/og-image.png',
}: SeoProps) {
  const location = useLocation();
  const matched = PAGES[location.pathname];
  const pageTitle = title || matched?.title || SITE_NAME;
  const pageDescription =
    description || matched?.description || SITE_TAGLINE;
  const pagePath = path || matched?.path || location.pathname;
  const robots =
    (noindex ?? matched?.noindex) ? 'noindex, nofollow' : 'index, follow';
  const canonical = absoluteUrl(pagePath);
  const ogImage = absoluteUrl(image);

  useEffect(() => {
    document.title = documentTitle(pageTitle);
    upsertMeta('name', 'description', pageDescription);
    upsertMeta('name', 'robots', robots);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:title', documentTitle(pageTitle));
    upsertMeta('property', 'og:description', pageDescription);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:locale', 'en_NG');
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', documentTitle(pageTitle));
    upsertMeta('name', 'twitter:description', pageDescription);
    upsertMeta('name', 'twitter:image', ogImage);
    upsertLink('canonical', canonical);
  }, [pageTitle, pageDescription, robots, canonical, ogImage]);

  return null;
}

/** Organization + LocalBusiness JSON-LD for GadgetBid. */
export function LocalBusinessJsonLd() {
  useEffect(() => {
    const id = 'gadgetbid-localbusiness-jsonld';
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': ['Organization', 'LocalBusiness'],
      '@id': `${SITE_URL}/#organization`,
      name: 'GadgetBid',
      legalName: 'GadgetBid',
      url: SITE_URL,
      logo: absoluteUrl('/icon-512.png'),
      image: absoluteUrl('/og-image.png'),
      description: SITE_TAGLINE,
      email: 'support@gadgetbid.ng',
      areaServed: {
        '@type': 'Country',
        name: 'Nigeria',
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Lagos',
        addressRegion: 'LA',
        addressCountry: 'NG',
      },
      sameAs: [],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@gadgetbid.ng',
        availableLanguage: ['en'],
      },
    });
  }, []);

  return null;
}

export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; path: string }[];
}) {
  const serialized = JSON.stringify(items);

  useEffect(() => {
    const parsed = JSON.parse(serialized) as { name: string; path: string }[];
    const id = 'gadgetbid-breadcrumb-jsonld';
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: parsed.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: absoluteUrl(item.path),
      })),
    });
    return () => {
      script?.remove();
    };
  }, [serialized]);

  return null;
}
