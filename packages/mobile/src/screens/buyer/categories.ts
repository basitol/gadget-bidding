/** Buyer-facing category chips → backend category slugs. */
export const CATEGORY_CHIPS: { label: string; slug: string | null }[] = [
  { label: 'All', slug: null },
  { label: 'Phones', slug: 'smartphones' },
  { label: 'Laptops', slug: 'laptops' },
  { label: 'Audio', slug: 'headphones' },
  { label: 'Gaming', slug: 'gaming' },
  { label: 'Wearables', slug: 'smartwatches' },
  { label: 'Tablets', slug: 'tablets' },
];

export const initialsOf = (name?: string | null) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('');
