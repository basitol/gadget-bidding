export function money(n?: number | null) {
  return `₦${Number(n || 0).toLocaleString('en-NG')}`;
}

export function when(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function formatAddress(addr: any) {
  if (!addr) return '';
  return [
    addr.full_name,
    addr.phone_number,
    addr.address_line1,
    addr.address_line2,
    [addr.city, addr.state].filter(Boolean).join(', '),
    addr.postal_code,
    addr.country || 'Nigeria',
  ]
    .filter(Boolean)
    .join('\n');
}

export function label(value?: string | null) {
  if (!value) return '—';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}
