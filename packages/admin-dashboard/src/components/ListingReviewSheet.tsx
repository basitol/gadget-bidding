import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CONDITION_GRADES,
  PARTS_HISTORY_OPTIONS,
  PART_SOURCES,
  photoSlotsFor,
  profileByKey,
  type Disclosure,
} from '@gadget-bidding/shared';
import { adminApi, type ListingReview } from '@/api';
import { type Tone } from '@/components/shared';
import { Chip, Note, Row, Section, redOutline, secondary } from '@/components/SellerApplicationPanel';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { friendlyTime, label, money } from '@/lib/format';
import { mediaUrl } from '@/lib/media';

const STATUS: Record<string, { text: string; tone: Tone }> = {
  pending: { text: 'Waiting for review', tone: 'info' },
  approved: { text: 'Approved', tone: 'ok' },
  listed: { text: 'Live', tone: 'ok' },
  rejected: { text: 'Sent back', tone: 'warn' },
  sold: { text: 'Sold', tone: 'neutral' },
};

const DISCLOSURE_TONE: Record<Disclosure['tone'], Tone> = {
  amber: 'warn',
  blue: 'info',
  red: 'danger',
  neutral: 'neutral',
};

const days = (hours?: number | null) => (hours ? `${Math.round(hours / 24)} day${hours === 24 ? '' : 's'}` : '—');

const specValue = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '—' : String(v));

/**
 * Review sheet for listings made with the 8-step "List a gadget" flow (specifications.profile is set).
 * Older listings keep the simple dialog on the Listing review page.
 */
export function ListingReviewSheet({
  gadgetId,
  busy,
  onClose,
  onApprove,
  onReject,
}: {
  gadgetId: string | null;
  busy: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [item, setItem] = useState<ListingReview | null>(null);
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    if (!gadgetId) return;
    setFailed('');
    try {
      const res = await adminApi.gadgetReview(gadgetId);
      setItem(res.data);
    } catch (err: any) {
      setFailed(err.message || 'Couldn’t load this listing.');
    }
  }, [gadgetId]);

  useEffect(() => {
    setItem(null);
    load();
  }, [load]);

  const specs = item?.specifications ?? {};
  const profile = profileByKey(item?.profile);
  const fromSerial = new Set<string>(Array.isArray(specs.from_serial) ? specs.from_serial : []);
  const damage: string[] = Array.isArray(specs.damage) ? specs.damage : [];
  const slots = profile ? photoSlotsFor(profile, damage.length > 0) : [];
  const photos: Record<string, string> = specs.photos ?? {};
  const grade = CONDITION_GRADES.find(g => g.key === item?.condition);
  const repairs = specs.repairs ?? {};
  const changedParts = Object.entries((repairs.parts ?? {}) as Record<string, string>);
  const idName = item?.identifier_kind === 'imei' ? 'IMEI' : 'Serial number';
  const status = STATUS[item?.status ?? ''] ?? { text: label(item?.status), tone: 'neutral' as Tone };
  const optionLabels = (keys: unknown, list: { key: string; label: string }[] | undefined) =>
    Array.isArray(keys) && keys.length ? keys.map(k => list?.find(o => o.key === k)?.label ?? k).join(', ') : 'None';

  return (
    <Sheet open={!!gadgetId} onOpenChange={open => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="gap-1 border-b border-line px-6 pb-5 pt-6 pr-14">
          <SheetTitle className="text-[19px] font-medium tracking-[-0.01em] text-ink">{item?.title ?? 'Listing'}</SheetTitle>
          <SheetDescription className="text-[14px] text-slate">
            {item
              ? [item.profile_label, item.seller ? `Seller ${item.seller.seller_code}` : null, `Sent ${friendlyTime(item.updated_at ?? item.created_at)}`]
                  .filter(Boolean)
                  .join(' · ')
              : failed
                ? 'Couldn’t load it'
                : 'Loading…'}
          </SheetDescription>
          {item ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip tone={status.tone}>{status.text}</Chip>
              {item.duplicate ? <Chip tone="danger">Duplicate</Chip> : null}
              {item.category_name ? <Chip tone="neutral">{item.category_name}</Chip> : null}
            </div>
          ) : null}
        </SheetHeader>

        {failed && !item ? (
          <div className="flex flex-col items-start gap-3 px-6 py-6">
            <p role="alert" className="text-[14px] text-[#D9536A]">
              {failed}
            </p>
            <Button variant="outline" className={secondary} onClick={load}>
              Try again
            </Button>
          </div>
        ) : !item ? (
          <div className="flex flex-col gap-4 px-6 py-6">
            <Skeleton className="h-24 rounded-[18px]" />
            <Skeleton className="h-64 rounded-[18px]" />
          </div>
        ) : (
          <div className="flex flex-col gap-8 px-6 pb-10 pt-6">
            {item.duplicate ? (
              <Note tone="danger" title={`This ${idName === 'IMEI' ? 'IMEI' : 'serial number'} is on another listing or a recent sale`}>
                Check it’s the same seller’s device, or ask for proof it’s theirs before approving.
              </Note>
            ) : null}
            {item.status === 'rejected' && item.rejection_reason ? (
              <Note tone="warn" title="Sent back to the seller">
                “{item.rejection_reason}”
              </Note>
            ) : null}

            <Section title={`Photos · ${slots.filter(s => photos[s.key]).length}`}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {slots.map(slot => (
                  <li key={slot.key} className="flex flex-col gap-1.5">
                    {photos[slot.key] ? (
                      <a
                        href={mediaUrl(photos[slot.key])}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-[12px] ring-1 ring-line focus-visible:outline-2 focus-visible:outline-blue-brand"
                        aria-label={`Open the ${slot.label} photo in a new tab`}
                      >
                        <img src={mediaUrl(photos[slot.key])} alt={slot.label} className="aspect-square w-full object-cover" />
                      </a>
                    ) : (
                      <div className="grid aspect-square w-full place-items-center rounded-[12px] bg-fill px-2 text-center text-[13px] text-slate">
                        Not added
                      </div>
                    )}
                    <span className="text-[13px] text-slate">
                      {slot.label}
                      {slot.required || slot.ifDamage ? '' : ' · optional'}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Device">
              <dl className="rounded-[18px] border border-line bg-white px-4">
                <Row k="Kind">{item.profile_label ?? '—'}</Row>
                <Row k="Model">
                  {item.model ?? '—'}
                  {item.brand ? <span className="block text-[13px] text-slate">{item.brand}</span> : null}
                </Row>
                {item.identifier_kind && item.identifier_kind !== 'none' ? (
                  <Row k={idName}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums tracking-[0.02em]">{item.device_identifier ?? 'Not given'}</span>
                      {item.duplicate ? <Chip tone="danger">Duplicate</Chip> : null}
                    </span>
                    <span className="block text-[13px] text-slate">
                      Only our team sees the full number. Buyers see {specs.identifier_masked ?? 'nothing'}.
                    </span>
                  </Row>
                ) : null}
                {(profile?.specs ?? []).map(f => (
                  <Row key={f.key} k={f.label}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{specValue(specs[f.key])}</span>
                      {fromSerial.has(f.key) ? <Chip tone="info">From serial</Chip> : null}
                    </span>
                  </Row>
                ))}
              </dl>
            </Section>

            {item.identifier_matches.length ? (
              <Section title="Same number elsewhere">
                <ul className="flex flex-col gap-2">
                  {item.identifier_matches.map(m => (
                    <li key={m.gadget_id} className="rounded-[18px] border border-line bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium text-ink">{m.title}</span>
                        <span className="ml-auto">
                          <Chip tone={m.counts_as_duplicate ? 'danger' : 'neutral'}>
                            {m.sold_at ? `Sold ${friendlyTime(m.sold_at)}` : label(m.status)}
                          </Chip>
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-slate">
                        {m.same_seller ? 'Same seller' : m.seller_name ?? 'Another seller'} · listed {friendlyTime(m.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title="Locks">
              <ul className="flex flex-col gap-2 rounded-[18px] border border-line bg-white px-4 py-3">
                {(profile?.locks ?? []).map(lock => (
                  <li key={lock} className="flex items-start gap-3 text-[14px] text-ink">
                    <span className="min-w-0 flex-1">{lock}</span>
                    <Chip tone={specs.locks_confirmed ? 'ok' : 'danger'}>{specs.locks_confirmed ? 'Confirmed' : 'Not confirmed'}</Chip>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Condition">
              <dl className="rounded-[18px] border border-line bg-white px-4">
                <Row k="Grade">
                  {grade?.label ?? label(item.condition)}
                  {grade ? <span className="block text-[13px] text-slate">{grade.help}</span> : null}
                </Row>
                {profile?.batteryHealth ? (
                  <Row k="Battery health">{typeof specs.battery_health === 'number' ? `${specs.battery_health}%` : 'Not given'}</Row>
                ) : null}
                <Row k="Not working">{optionLabels(specs.faults, profile?.faults)}</Row>
                <Row k="In the box">{optionLabels(specs.included, profile?.inBox)}</Row>
              </dl>
            </Section>

            <Section title="Repairs & damage">
              <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-white p-4">
                <p className="text-[14px] text-ink">
                  {repairs.opened === 'never'
                    ? 'Never opened or repaired.'
                    : repairs.opened === 'not_sure'
                      ? 'The seller isn’t sure if it was opened.'
                      : changedParts.length
                        ? `Opened, ${changedParts.length} part${changedParts.length === 1 ? '' : 's'} changed:`
                        : 'Opened, no parts changed.'}
                </p>
                {changedParts.length ? (
                  <ul className="flex flex-col gap-1 text-[14px] text-ink">
                    {changedParts.map(([key, source]) => (
                      <li key={key}>
                        {profile?.parts.find(p => p.key === key)?.label ?? key} ·{' '}
                        <span className="text-slate">{PART_SOURCES.find(s => s.key === source)?.label ?? source}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {repairs.parts_history ? (
                  <p className="text-[14px] text-ink">
                    Parts & Service History: {PARTS_HISTORY_OPTIONS.find(o => o.key === repairs.parts_history)?.label ?? repairs.parts_history}
                  </p>
                ) : null}
                <div>
                  <p className="mb-2 text-[13px] text-slate">Buyers will see</p>
                  {item.disclosures.length ? (
                    <div className="flex flex-wrap gap-2">
                      {item.disclosures.map(d => (
                        <Chip key={d.label} tone={DISCLOSURE_TONE[d.tone]}>
                          {d.label}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[14px] text-ink">No repairs or damage to show.</p>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Auction">
              <dl className="rounded-[18px] border border-line bg-white px-4">
                <Row k="Starting price">
                  <span className="tabular-nums">{item.auction_settings.starting_price != null ? money(item.auction_settings.starting_price) : '—'}</span>
                </Row>
                <Row k="Hidden lowest price">
                  <span className="tabular-nums">
                    {item.auction_settings.reserve_price != null ? money(item.auction_settings.reserve_price) : 'None'}
                  </span>
                  {item.auction_settings.reserve_price != null ? (
                    <span className="block text-[13px] text-slate">Buyers don’t see this. It won’t sell below it.</span>
                  ) : null}
                </Row>
                <Row k="Runs for">{days(item.auction_settings.duration_hours)}</Row>
                <Row k="Starts">{item.auction_settings.start_now ? 'As soon as it’s approved' : 'A day after approval'}</Row>
              </dl>
            </Section>

            <Section title="Seller">
              <dl className="rounded-[18px] border border-line bg-white px-4">
                <Row k="Seller">
                  {item.seller ? (
                    <>
                      {item.seller.full_name} · {item.seller.seller_code}
                      <span className="block text-[13px] text-slate">
                        {[item.seller.phone_number, item.seller.email].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </Row>
                <Row k="Statement">
                  “This item is mine to sell, and the details are true.”
                  <span className="block text-[13px] text-slate">
                    {item.seller_attested_at ? `Confirmed ${friendlyTime(item.seller_attested_at)}` : 'Not confirmed'}
                  </span>
                </Row>
                <Row k="Seller’s note">{item.seller_note ? `“${item.seller_note}”` : 'No note'}</Row>
              </dl>
            </Section>

            <Section title="Description buyers read">
              <p className="whitespace-pre-line rounded-[18px] border border-line bg-white p-4 text-[14px] leading-6 text-ink">
                {item.description}
              </p>
            </Section>

            {item.status === 'pending' ? (
              <Section title="Decision">
                <div className="flex flex-col gap-4 rounded-[18px] border border-line bg-white p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      className="h-10 rounded-[10px] px-4 text-[14px] focus-visible:outline-2 focus-visible:outline-blue-brand"
                      disabled={busy}
                      onClick={() => onApprove(item.id)}
                    >
                      {busy ? 'Saving…' : 'Approve and put it live'}
                    </Button>
                    <span className="text-[13px] text-slate">
                      The auction starts now and runs {days(item.auction_settings.duration_hours)}.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <Button variant="outline" className={redOutline} disabled={busy} onClick={() => onReject(item.id)}>
                      Send back to the seller
                    </Button>
                    <span className="text-[13px] text-slate">You’ll be asked what to fix. The seller can edit and send it again.</span>
                  </div>
                </div>
              </Section>
            ) : item.auction ? (
              <div>
                <Button asChild variant="outline" className={secondary}>
                  <Link to={`/auctions?search=${encodeURIComponent(item.title)}`}>Open the auction</Link>
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
