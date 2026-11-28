import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Flag, Gavel, NotebookPen, Package } from 'lucide-react';
import { toast } from 'sonner';
import { peopleApi, type BuyerDetail, type BuyerOrder } from '@/api';
import { SectionCard } from '@/components/attention';
import { Seo } from '@/components/Seo';
import { Chip, redOutline, secondary } from '@/components/SellerApplicationPanel';
import type { Tone } from '@/components/shared';
import { PageLoadError, usePageCrumb } from '@/components/states';
import { Button } from '@/components/ui/button';
import { money } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import {
  DetailSkeleton,
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
  dayLabel,
  dayMonth,
  endsLabel,
  errorText,
  monthYear,
  num,
  primary,
  td,
  th,
  useRows,
  type ChipTone,
} from './shared';
import { PersonSheets, sheetCrumb, type PersonRef, type SheetAction } from './sheets';

type BuyerTab = 'orders' | 'bids' | 'disputes' | 'notes';

const ORDER_TONE: Record<BuyerOrder['status'], ChipTone> = {
  in_progress: 'info',
  completed: 'ok',
  not_paid: 'danger',
  refunded: 'violet',
  cancelled: 'neutral',
};

/** Dispute chips: open (amber), being looked at (blue), resolved (green), closed (quiet). */
const disputeTone = (status: string): Tone =>
  status === 'resolved'
    ? 'ok'
    : status === 'closed'
      ? 'neutral'
      : status === 'investigating'
        ? 'info'
        : status === 'open'
          ? 'warn'
          : 'neutral';

/** /buyers/:id — a new buyer, a fresh page. */
export function BuyerDetailPage() {
  const { id = '' } = useParams();
  return <BuyerView key={id} id={id} />;
}

/**
 * One buyer: who they are, what's in place on their account, their numbers, then Orders, Live bids,
 * Disputes and team Notes. Suspend / Restore open the sheet; "Send password reset" emails a code.
 */
function BuyerView({ id }: { id: string }) {
  const ids = useId();
  const [buyer, setBuyer] = useState<BuyerDetail | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const loaded = useRef(false);
  const [tab, setTab] = useState<BuyerTab>('orders');
  const [action, setAction] = useState<SheetAction | null>(null);
  const [version, setVersion] = useState(0);
  const [resetting, setResetting] = useState(false);

  usePageCrumb(action ? sheetCrumb(action) : buyer?.name ?? null);

  const load = useCallback(() => {
    peopleApi
      .buyer(id)
      .then(r => {
        loaded.current = true;
        setBuyer(r.data);
        setFailure(null);
      })
      .catch(e => {
        if (!loaded.current) setFailure(e);
        else toast.error('We couldn’t refresh this buyer', { description: errorText(e) });
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!buyer) {
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
          title="We couldn’t load this buyer"
          error={failure}
          onRetry={() => {
            setFailure(null);
            load();
          }}
        />
      </div>
    );
  }

  const b = buyer;
  const s = b.stats;
  const person: PersonRef = { id: b.id, name: b.name, email: b.email, type: 'buyer', status: b.status };
  const refreshKey = String(version);

  const sendReset = async () => {
    setResetting(true);
    try {
      const r = await peopleApi.passwordReset(b.id);
      toast.success(`Reset code sent to ${r.data.sent_to}`);
    } catch (e) {
      toast.error('We couldn’t send the reset code', { description: errorText(e) });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-16">
      <Seo title={`${b.name} · Buyers`} description={`Buyer account for ${b.name}.`} path={`/buyers/${b.id}`} noindex />

      <PersonHeader
        chips={
          <>
            <StatusChip status={b.status} />
            <Chip tone="info">Buyer</Chip>
            {b.two_factor ? <Chip tone="neutral">2-step sign-in on</Chip> : null}
          </>
        }
        actions={
          <>
            <Button variant="outline" className={secondary} disabled={resetting} onClick={sendReset}>
              {resetting ? 'Sending…' : 'Send password reset'}
            </Button>
            {b.status === 'active' ? (
              <Button variant="outline" className={redOutline} onClick={() => setAction({ kind: 'suspend', person })}>
                Suspend
              </Button>
            ) : b.status !== 'pending_approval' ? (
              <Button className={primary} onClick={() => setAction({ kind: 'restore', person })}>
                Restore
              </Button>
            ) : null}
          </>
        }
        tile={<PersonTile name={b.name} type="buyer" />}
        name={b.name}
        sub={[b.email, b.phone_masked, b.joined_at ? `joined ${monthYear(b.joined_at)}` : null].filter(Boolean).join(' · ')}
        note={b.restriction ? <RestrictionNote restriction={b.restriction} /> : null}
        facts={
          <>
            <Fact k="Orders">{num(s.orders)}</Fact>
            <Fact k="Spent">{money(s.spent)}</Fact>
            <Fact k="Live bids">{num(s.live_bids)}</Fact>
            <Fact k="Disputes">{num(s.disputes)}</Fact>
            <Fact k="Missed payments">
              <Chip tone={s.missed_90d > 0 ? 'warn' : 'neutral'}>
                {num(s.missed_90d)} of {num(s.missed_limit)}
              </Chip>
            </Fact>
            <Fact k="Last active">{dayLabel(s.last_active_at)}</Fact>
          </>
        }
      />

      <UnderlineTabs
        label={`${b.name}’s activity`}
        idBase={ids}
        active={tab}
        onSelect={setTab}
        items={[
          { key: 'orders', label: 'Orders', count: b.counts.orders },
          { key: 'bids', label: 'Live bids', count: b.counts.live_bids },
          { key: 'disputes', label: 'Disputes', count: b.counts.disputes },
          { key: 'notes', label: 'Notes', count: b.counts.notes },
        ]}
      />

      <div role="tabpanel" id={`${ids}-panel-${tab}`} aria-labelledby={`${ids}-tab-${tab}`}>
        {tab === 'orders' ? (
          <OrdersCard id={b.id} refreshKey={refreshKey} />
        ) : tab === 'bids' ? (
          <BidsCard id={b.id} refreshKey={refreshKey} />
        ) : tab === 'disputes' ? (
          <DisputesCard id={b.id} refreshKey={refreshKey} />
        ) : (
          <SectionCard
            icon={<NotebookPen className="size-5 text-blue-brand" aria-hidden />}
            title="Notes"
            description="What the team knows about this buyer. Suspend and restore notes show up here too."
          >
            <NotesPanel
              personId={b.id}
              refreshKey={refreshKey}
              onAdded={() =>
                setBuyer(prev => prev && { ...prev, counts: { ...prev.counts, notes: prev.counts.notes + 1 } })
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
    </div>
  );
}

/* ---------------- Tabs ---------------- */

const rowCls = 'border-b border-line last:border-0';

function OrdersCard({ id, refreshKey }: { id: string; refreshKey: string }) {
  const state = useRows(() => peopleApi.buyerOrders(id), `${id}|${refreshKey}`);
  return (
    <SectionCard
      icon={<Package className="size-5 text-blue-brand" aria-hidden />}
      title="Orders"
      description="Everything this buyer has won."
    >
      <RowsState state={state} what="their orders" empty="No orders yet. Auctions they win show up here.">
        {rows => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={cn(th, 'pl-6')}>Order</th>
                  <th scope="col" className={th}>Item</th>
                  <th scope="col" className={cn(th, 'text-right')}>Amount</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={cn(th, 'pr-6')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(o => (
                  <tr key={o.id} className={rowCls}>
                    <td className={cn(td, 'pl-6 whitespace-nowrap')}>
                      <div className="text-[14px] font-medium text-ink">{o.order_number}</div>
                      <div className="text-[13px] text-slate">{dayMonth(o.created_at)}</div>
                    </td>
                    <td className={td}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Thumb src={o.image ? mediaUrl(o.image) : null} alt="" />
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium text-ink">{o.title}</div>
                          {o.seller_code ? (
                            <div className="text-[13px] text-slate">Verified seller {o.seller_code}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right text-[14px] font-medium text-ink tabular-nums')}>
                      {money(o.amount)}
                    </td>
                    <td className={td}>
                      <TintChip tone={ORDER_TONE[o.status] ?? 'neutral'}>{o.status_label}</TintChip>
                    </td>
                    <td className={cn(td, 'pr-6 text-right')}>
                      <LinkButton
                        to={`/orders?search=${encodeURIComponent(o.order_number)}`}
                        label={`Open order ${o.order_number}`}
                      >
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

function BidsCard({ id, refreshKey }: { id: string; refreshKey: string }) {
  const state = useRows(() => peopleApi.buyerBids(id), `${id}|${refreshKey}`);
  return (
    <SectionCard
      icon={<Gavel className="size-5 text-blue-brand" aria-hidden />}
      title="Live bids"
      description="Auctions they’re bidding in right now."
    >
      <RowsState state={state} what="their live bids" empty="No live bids right now.">
        {rows => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={cn(th, 'pl-6')}>Item</th>
                  <th scope="col" className={cn(th, 'text-right')}>My bid</th>
                  <th scope="col" className={cn(th, 'text-right')}>Current price</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={cn(th, 'pr-6')}>Ends</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(bid => (
                  <tr key={bid.auction_id} className={rowCls}>
                    <td className={cn(td, 'pl-6')}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Thumb src={bid.image ? mediaUrl(bid.image) : null} alt="" />
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium text-ink">{bid.title}</div>
                          <div className="text-[13px] text-slate">{num(bid.bids)} {bid.bids === 1 ? 'bid' : 'bids'}</div>
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right text-[14px] text-ink tabular-nums')}>
                      {money(bid.my_bid)}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right text-[14px] font-medium text-ink tabular-nums')}>
                      {money(bid.current_price)}
                    </td>
                    <td className={td}>
                      <Chip tone={bid.leading ? 'ok' : 'danger'}>{bid.leading ? 'Leading' : 'Outbid'}</Chip>
                    </td>
                    <td className={cn(td, 'pr-6 whitespace-nowrap text-[14px] text-ink tabular-nums')}>
                      {endsLabel(bid.ends_at)}
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

function DisputesCard({ id, refreshKey }: { id: string; refreshKey: string }) {
  const state = useRows(() => peopleApi.buyerDisputes(id), `${id}|${refreshKey}`);
  return (
    <SectionCard
      icon={<Flag className="size-5 text-blue-brand" aria-hidden />}
      title="Disputes"
      description="Cases on this buyer’s orders."
    >
      <RowsState state={state} what="their disputes" empty="No disputes. Nothing has gone wrong on their orders.">
        {rows => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={cn(th, 'pl-6')}>Case</th>
                  <th scope="col" className={th}>Order</th>
                  <th scope="col" className={th}>Item</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Opened</th>
                  <th scope="col" className={cn(th, 'pr-6')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.id} className={rowCls}>
                    <td className={cn(td, 'pl-6 whitespace-nowrap text-[14px] font-medium text-ink')}>{d.case_number}</td>
                    <td className={cn(td, 'whitespace-nowrap text-[14px] text-ink')}>{d.order_number ?? '—'}</td>
                    <td className={cn(td, 'max-w-[280px] truncate text-[14px] text-ink')}>{d.title ?? '—'}</td>
                    <td className={td}>
                      <Chip tone={disputeTone(d.status)}>{d.status_label}</Chip>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-[14px] text-ink')}>{dayLabel(d.opened_at)}</td>
                    <td className={cn(td, 'pr-6 text-right')}>
                      <LinkButton to={`/disputes?case=${encodeURIComponent(d.id)}`} label={`Open case ${d.case_number}`}>
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
