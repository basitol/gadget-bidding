import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Gavel, IdCard, NotebookPen, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { peopleApi, sellerApplicationsApi, type SellerDetail, type SellerListing } from '@/api';
import { SectionCard } from '@/components/attention';
import { Seo } from '@/components/Seo';
import { Chip, docChip, redOutline, secondary } from '@/components/SellerApplicationPanel';
import type { Tone } from '@/components/shared';
import { PageLoadError, usePageCrumb } from '@/components/states';
import { Button } from '@/components/ui/button';
import { compactMoney, friendlyTime, money } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import {
  DetailSkeleton,
  EmptyRows,
  Fact,
  LinkButton,
  LoadingStatus,
  NotesPanel,
  PersonHeader,
  PersonTile,
  RestrictionNote,
  RowsState,
  StatusChip,
  Thumb,
  TintChip,
  UnderlineTabs,
  dayMonth,
  errorText,
  num,
  plural,
  primary,
  td,
  th,
  useRows,
} from './shared';
import { PersonSheets, RequestDocumentsSheet, sheetCrumb, type PersonRef, type SheetAction } from './sheets';

type SellerTab = 'listings' | 'payouts' | 'kyb' | 'notes';

const LISTING_TONE: Record<SellerListing['status'], Tone> = {
  live: 'ok',
  scheduled: 'info',
  in_review: 'info',
  changes: 'warn',
  sold: 'neutral',
  unsold: 'neutral',
  paused: 'warn',
  rejected: 'danger',
};

/** Payout chips: paid (green), on its way (blue), held (amber), failed (red). */
const payoutTone = (status: string): Tone =>
  status === 'paid'
    ? 'ok'
    : status === 'sending' || status === 'processing'
      ? 'info'
      : status === 'held' || status === 'pending'
        ? 'warn'
        : status === 'failed'
          ? 'danger'
          : 'neutral';

const textLink =
  'rounded text-[14px] font-medium text-blue-press underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-brand';

/** /sellers/:id — a new seller, a fresh page. */
export function SellerDetailPage() {
  const { id = '' } = useParams();
  return <SellerView key={id} id={id} />;
}

/**
 * One seller (store): what's in place, their numbers, then Listings, Payouts, KYB documents and team
 * Notes. Pause listings / Restore open the sheet; "Request documents" asks for an updated KYB document.
 */
function SellerView({ id }: { id: string }) {
  const ids = useId();
  const [seller, setSeller] = useState<SellerDetail | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const loaded = useRef(false);
  const [tab, setTab] = useState<SellerTab>('listings');
  const [action, setAction] = useState<SheetAction | null>(null);
  const [asking, setAsking] = useState(false);
  const [version, setVersion] = useState(0);

  usePageCrumb(action ? sheetCrumb(action) : seller?.name ?? null);

  const load = useCallback(() => {
    peopleApi
      .seller(id)
      .then(r => {
        loaded.current = true;
        setSeller(r.data);
        setFailure(null);
      })
      .catch(e => {
        if (!loaded.current) setFailure(e);
        else toast.error('We couldn’t refresh this seller', { description: errorText(e) });
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!seller) {
    if (!failure) {
      return (
        <>
          <LoadingStatus />
          <DetailSkeleton />
        </>
      );
    }
    return (
      <div className="pb-16 pt-1">
        <PageLoadError
          area="USR"
          title="We couldn’t load this seller"
          error={failure}
          onRetry={() => {
            setFailure(null);
            load();
          }}
        />
      </div>
    );
  }

  const sl = seller;
  const s = sl.stats;
  const person: PersonRef = { id: sl.id, name: sl.name, email: sl.email, type: 'seller', status: sl.status };
  const refreshKey = String(version);
  const approved = sl.kyb_status === 'approved';
  const sub = [sl.shop, sl.owner_name ? `owner ${sl.owner_name}` : null].filter(Boolean).join(' · ') || sl.email || '';

  return (
    <div className="flex flex-col gap-6 pb-16">
      <Seo title={`${sl.name} · Sellers`} description={`Seller account for ${sl.name}.`} path={`/sellers/${sl.id}`} noindex />

      <PersonHeader
        chips={
          <>
            <StatusChip status={sl.status} />
            <TintChip tone="violet">Seller · {sl.seller_code}</TintChip>
            {approved ? <Chip tone="info">KYB verified</Chip> : null}
          </>
        }
        actions={
          <>
            {approved && sl.application_id ? (
              <Button variant="outline" className={secondary} onClick={() => setAsking(true)}>
                Request documents
              </Button>
            ) : null}
            {sl.status === 'active' ? (
              <Button variant="outline" className={redOutline} onClick={() => setAction({ kind: 'pause', person })}>
                Pause listings
              </Button>
            ) : sl.status !== 'pending_approval' ? (
              <Button className={primary} onClick={() => setAction({ kind: 'restore', person })}>
                Restore
              </Button>
            ) : null}
          </>
        }
        tile={<PersonTile name={sl.name} type="seller" />}
        name={sl.name}
        sub={sub}
        note={sl.restriction ? <RestrictionNote restriction={sl.restriction} /> : null}
        facts={
          <>
            <Fact k="Sales">{num(s.sales)}</Fact>
            <Fact k="Sold value">{compactMoney(s.sold_value)}</Fact>
            <Fact k="Rating">{s.rating != null ? s.rating.toFixed(1) : '—'}</Fact>
            <Fact k="Passed checks">{s.passed_percent != null ? `${Math.round(s.passed_percent)}%` : '—'}</Fact>
            <Fact k="Open disputes">
              {s.open_disputes > 0 ? <Chip tone="warn">{num(s.open_disputes)}</Chip> : '0'}
            </Fact>
            <Fact k="On hold">{money(s.on_hold)}</Fact>
          </>
        }
      />

      <UnderlineTabs
        label={`${sl.name}’s store`}
        idBase={ids}
        active={tab}
        onSelect={setTab}
        items={[
          { key: 'listings', label: 'Listings', count: sl.counts.listings },
          { key: 'payouts', label: 'Payouts', count: sl.counts.payouts },
          { key: 'kyb', label: 'KYB documents' },
          { key: 'notes', label: 'Notes', count: sl.counts.notes },
        ]}
      />

      <div role="tabpanel" id={`${ids}-panel-${tab}`} aria-labelledby={`${ids}-tab-${tab}`}>
        {tab === 'listings' ? (
          <ListingsCard id={sl.id} refreshKey={refreshKey} />
        ) : tab === 'payouts' ? (
          <PayoutsCard id={sl.id} refreshKey={refreshKey} />
        ) : tab === 'kyb' ? (
          sl.application_id ? (
            <KybCard applicationId={sl.application_id} refreshKey={refreshKey} />
          ) : (
            <SectionCard
              icon={<IdCard className="size-5 text-blue-brand" aria-hidden />}
              title="KYB documents"
              description="The documents Seller KYB checked."
            >
              <EmptyRows>There’s no KYB application on file for this seller.</EmptyRows>
            </SectionCard>
          )
        ) : (
          <SectionCard
            icon={<NotebookPen className="size-5 text-blue-brand" aria-hidden />}
            title="Notes"
            description="What the team knows about this seller. Pause and restore notes show up here too."
          >
            <NotesPanel
              personId={sl.id}
              refreshKey={refreshKey}
              onAdded={() =>
                setSeller(prev => prev && { ...prev, counts: { ...prev.counts, notes: prev.counts.notes + 1 } })
              }
            />
          </SectionCard>
        )}
      </div>

      <PersonSheets
        action={action}
        onClose={() => setAction(null)}
        onDone={() => {
          load();
          setVersion(v => v + 1);
        }}
      />
      {sl.application_id ? (
        <RequestDocumentsSheet
          open={asking}
          seller={{ name: sl.name, seller_code: sl.seller_code, application_id: sl.application_id }}
          onClose={() => setAsking(false)}
          onDone={() => setVersion(v => v + 1)}
        />
      ) : null}
    </div>
  );
}

/* ---------------- Tabs ---------------- */

const rowCls = 'border-b border-line last:border-0';

function ListingsCard({ id, refreshKey }: { id: string; refreshKey: string }) {
  const state = useRows(() => peopleApi.sellerListings(id), `${id}|${refreshKey}`);
  return (
    <SectionCard
      icon={<Gavel className="size-5 text-blue-brand" aria-hidden />}
      title="Listings"
      description="Live, in review and recently sold."
    >
      <RowsState state={state} what="their listings" empty="No listings yet. What they send for review shows up here.">
        {rows => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={cn(th, 'pl-6')}>Listing</th>
                  <th scope="col" className={cn(th, 'text-right')}>Price</th>
                  <th scope="col" className={cn(th, 'text-right')}>Bids</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={cn(th, 'pr-6')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(l => (
                  <tr key={l.id} className={rowCls}>
                    <td className={cn(td, 'pl-6')}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Thumb src={l.image ? mediaUrl(l.image) : null} alt="" />
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium text-ink">{l.title}</div>
                          {l.sub ? <div className="text-[13px] text-slate">{l.sub}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right text-[14px] font-medium text-ink tabular-nums')}>
                      {money(l.price)}
                    </td>
                    <td className={cn(td, 'text-right text-[14px] text-ink tabular-nums')}>
                      {l.bids != null ? num(l.bids) : '—'}
                    </td>
                    <td className={td}>
                      <Chip tone={LISTING_TONE[l.status] ?? 'neutral'}>{l.status_label}</Chip>
                    </td>
                    <td className={cn(td, 'pr-6 text-right')}>
                      <LinkButton to={l.path} label={`Open ${l.title}`}>
                        Open
                      </LinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RowsState>
    </SectionCard>
  );
}

function PayoutsCard({ id, refreshKey }: { id: string; refreshKey: string }) {
  const state = useRows(() => peopleApi.sellerPayouts(id), `${id}|${refreshKey}`);
  return (
    <SectionCard
      icon={<Wallet className="size-5 text-blue-brand" aria-hidden />}
      title="Payouts"
      description="Money sent to this seller’s bank account."
      right={
        <Link to="/payouts" className={textLink}>
          Open Payouts & escrow
        </Link>
      }
    >
      <RowsState state={state} what="their payouts" empty="No payouts yet.">
        {rows => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={cn(th, 'pl-6')}>Reference</th>
                  <th scope="col" className={th}>Date</th>
                  <th scope="col" className={th}>Orders</th>
                  <th scope="col" className={cn(th, 'text-right')}>Amount</th>
                  <th scope="col" className={cn(th, 'pr-6')}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className={rowCls}>
                    <td className={cn(td, 'pl-6 whitespace-nowrap text-[14px] font-medium text-ink')}>{p.reference}</td>
                    <td className={cn(td, 'whitespace-nowrap text-[14px] text-ink')}>{dayMonth(p.created_at)}</td>
                    <td className={cn(td, 'whitespace-nowrap text-[14px] text-ink tabular-nums')}>
                      {plural(p.orders, 'order', 'orders')}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right text-[14px] font-medium text-ink tabular-nums')}>
                      {money(p.amount)}
                    </td>
                    <td className={cn(td, 'pr-6')}>
                      <Chip tone={payoutTone(p.status)}>{p.status_label}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RowsState>
    </SectionCard>
  );
}

function KybCard({ applicationId, refreshKey }: { applicationId: string; refreshKey: string }) {
  const state = useRows(
    () => sellerApplicationsApi.get(applicationId).then(r => ({ data: r.data.documents })),
    `${applicationId}|${refreshKey}`
  );
  return (
    <SectionCard
      icon={<IdCard className="size-5 text-blue-brand" aria-hidden />}
      title="KYB documents"
      description="The documents Seller KYB checked."
      right={
        <Link
          to={`/sellers/applications?status=all&application=${encodeURIComponent(applicationId)}`}
          className={textLink}
        >
          Open in Seller KYB
        </Link>
      }
    >
      <RowsState state={state} what="their documents" empty="They haven’t uploaded any documents.">
        {rows => (
          <ul>
            {rows.map(d => {
              const chip = docChip(d);
              return (
                <li key={d.kind} className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-ink">{d.label}</div>
                    <div className="text-[13px] text-slate">
                      {d.uploaded_at ? `Uploaded ${friendlyTime(d.uploaded_at)}` : 'Not uploaded'}
                    </div>
                  </div>
                  <Chip tone={chip.tone}>{chip.text}</Chip>
                </li>
              );
            })}
          </ul>
        )}
      </RowsState>
    </SectionCard>
  );
}
