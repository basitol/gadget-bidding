import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/api';
import { Badge, statusTone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { label, money, when } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { toast } from 'sonner';

/** Case fields this sheet reads beyond the shared admin types: the buyer's video(s). */
type CaseVideos = { videos?: string[] };
type HubRow = { label: string; value: string };
type SellerFile = { url: string; kind: 'photo' | 'video' | 'pdf'; name: string; seconds?: number };
/** "0:24" */
const clip = (s?: number) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`);
const sameRows = (a: HubRow[], b: HubRow[]) =>
  a.length === b.length && a.every((r, i) => r.label.trim() === b[i].label && r.value.trim() === b[i].value);
/** Cloudinary converts on delivery: ask for MP4 so .mov uploads from iPhones play in Chrome too. */
const playableUrl = (url: string) =>
  /res\.cloudinary\.com\/.+\/video\/upload\//.test(url) ? url.replace(/\.mov(\?|$)/i, '.mp4$1') : url;

/**
 * One case for our team: the buyer's report, the thread (reply as Gadgets Bidding team),
 * the decision with what we found, and the return + refund when it's a refund.
 */
export function CaseSheet({
  disputeId,
  onClose,
  onChanged,
}: {
  disputeId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [c, setC] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [findings, setFindings] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [hubRows, setHubRows] = useState<HubRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!disputeId) return;
    try {
      const data = (await adminApi.disputeCase(disputeId)).data;
      setC(data);
      setNextStep(data?.next_step ?? '');
      setHubRows(data?.hub_findings ?? []);
    } catch (err: any) {
      toast.error(err.message || "Couldn't load the case");
    }
  }, [disputeId]);

  useEffect(() => {
    setC(null);
    setReply('');
    setFindings('');
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      setC(res.data);
      if (key === 'hub') setHubRows(res.data?.hub_findings ?? []);
      toast.success(ok);
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  const decided = c && !c.in_review;
  const videos: string[] = (c as CaseVideos | null)?.videos ?? [];
  const seller = c?.seller ?? null;
  const sellerFiles: SellerFile[] = seller?.files ?? [];
  const sellerReview = !!seller?.second_review_requested_at && c?.in_review && c?.outcome === 'refund';
  const back = seller?.item_return ?? null;
  const cleanRows = hubRows.map(r => ({ label: r.label.trim(), value: r.value.trim() })).filter(r => r.label || r.value);
  const rowsChanged = c ? !sameRows(cleanRows, c.hub_findings ?? []) : false;
  const rowsValid = cleanRows.every(r => r.label && r.value && r.label.length <= 40 && r.value.length <= 60);

  return (
    <Sheet open={!!disputeId} onOpenChange={open => !open && onClose()}>
      <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{c ? `Case ${c.case_number}` : 'Case'}</SheetTitle>
          <SheetDescription>
            {c
              ? `${c.order.gadget?.title ?? 'Order'} · ${c.order.order_number} · ${money(c.order.total_amount)} held`
              : 'Loading…'}
          </SheetDescription>
        </SheetHeader>

        {c ? (
          <div className="flex flex-col gap-5 px-4 pb-6">
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(c.status)}>{label(c.status)}</Badge>
                {c.outcome ? (
                  <Badge tone={c.outcome === 'refund' ? 'warn' : 'ok'}>
                    {c.outcome === 'refund' ? 'Refund' : 'Not upheld'}
                  </Badge>
                ) : null}
                {c.second_review_requested_at ? <Badge tone="info">Second review</Badge> : null}
                {seller?.second_review_requested_at ? <Badge tone="info">Seller second review</Badge> : null}
                {seller?.accepted_at ? <Badge tone="warn">Seller accepted</Badge> : null}
              </div>
              <h3 className="text-sm font-medium">{c.problem.label}</h3>
              <p className="text-sm text-muted-foreground">“{c.problem.description}”</p>
              {c.photos.length ? (
                <div className="flex flex-wrap gap-2">
                  {c.photos.map((p: string) => (
                    <a key={p} href={mediaUrl(p)} target="_blank" rel="noreferrer">
                      <img src={mediaUrl(p)} alt="Buyer's photo" className="size-20 rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
              {videos.map((v, i) => (
                <div key={v} className="flex flex-col gap-1">
                  <video
                    src={playableUrl(mediaUrl(v))}
                    controls
                    preload="metadata"
                    playsInline
                    aria-label={`Buyer's video${videos.length > 1 ? ` ${i + 1}` : ''}`}
                    className="max-h-80 w-full rounded-[12px] bg-ink"
                  />
                  <a
                    href={mediaUrl(v)}
                    target="_blank"
                    rel="noreferrer"
                    className="self-start rounded text-xs font-medium text-blue-press underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-brand"
                  >
                    Open the video in a new tab
                  </a>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Reported {when(c.created_at)}</p>
            </section>

            {seller ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Seller's side</h3>
                {seller.accepted_at ? (
                  <p className="text-sm text-muted-foreground">
                    Accepted the return and refund {when(seller.accepted_at)}.
                  </p>
                ) : seller.replied_at ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge tone={seller.position === 'matched' ? 'info' : 'warn'}>{seller.position_label}</Badge>
                      <span className="text-xs text-muted-foreground">Replied {when(seller.replied_at)}</span>
                    </div>
                    {seller.reply ? <p className="text-sm text-muted-foreground">“{seller.reply}”</p> : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No reply yet. {c.in_review ? `Their 48 hours end ${when(seller.respond_by)}.` : ''}
                  </p>
                )}
                {sellerFiles.length ? (
                  <div className="flex flex-col gap-2">
                    {!seller.replied_at ? (
                      <p className="text-xs text-muted-foreground">Files added so far (the reply isn't sent yet):</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {sellerFiles
                        .filter(f => f.kind === 'photo')
                        .map(f => (
                          <a key={f.url} href={mediaUrl(f.url)} target="_blank" rel="noreferrer" title={f.name}>
                            <img src={mediaUrl(f.url)} alt={`Seller's photo: ${f.name}`} className="size-20 rounded-lg object-cover" />
                          </a>
                        ))}
                    </div>
                    {sellerFiles
                      .filter(f => f.kind === 'video')
                      .map(f => (
                        <video
                          key={f.url}
                          src={playableUrl(mediaUrl(f.url))}
                          controls
                          preload="metadata"
                          playsInline
                          aria-label={`Seller's video${f.seconds ? `, ${clip(f.seconds)}` : ''}`}
                          className="max-h-80 w-full rounded-[12px] bg-ink"
                        />
                      ))}
                    {sellerFiles
                      .filter(f => f.kind === 'pdf')
                      .map(f => (
                        <a
                          key={f.url}
                          href={mediaUrl(f.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="self-start rounded text-sm font-medium text-blue-press underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-brand"
                        >
                          {f.name} (PDF)
                        </a>
                      ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">What our hub found</h3>
              <p className="text-xs text-muted-foreground">
                Short rows the seller and buyer see, like "Battery health at hub" · "71%".
              </p>
              {hubRows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={r.label}
                    onChange={e => setHubRows(rows => rows.map((x, j) => (j === i ? { ...x, label: e.target.value.slice(0, 40) } : x)))}
                    placeholder="Battery health at hub"
                    aria-label={`Row ${i + 1} label`}
                    className="h-10 min-w-0 flex-1 rounded-[12px] border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-blue-brand"
                  />
                  <input
                    value={r.value}
                    onChange={e => setHubRows(rows => rows.map((x, j) => (j === i ? { ...x, value: e.target.value.slice(0, 60) } : x)))}
                    placeholder="71%"
                    aria-label={`Row ${i + 1} value`}
                    className="h-10 w-32 min-w-0 rounded-[12px] border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-blue-brand"
                  />
                  <Button
                    variant="ghost"
                    className="h-10 shrink-0 px-2"
                    onClick={() => setHubRows(rows => rows.filter((_, j) => j !== i))}
                    aria-label={`Remove row ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  disabled={hubRows.length >= 8}
                  onClick={() => setHubRows(rows => [...rows, { label: '', value: '' }])}
                >
                  Add a row
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy === 'hub' || !rowsChanged || !rowsValid}
                  onClick={() => run('hub', () => adminApi.disputeHubFindings(c.id, cleanRows), 'Hub findings saved')}
                >
                  Save rows
                </Button>
              </div>
              {!rowsValid ? <p className="text-xs text-[#D9536A]">Each row needs a label and a value.</p> : null}
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Messages</h3>
              {c.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {c.messages.map((m: any) => (
                    <li
                      key={m.id}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        m.role === 'team' ? 'bg-primary/10' : 'bg-muted'
                      }`}
                    >
                      <div className="mb-0.5 text-xs text-muted-foreground">
                        {m.author} · {when(m.at)}
                      </div>
                      {m.body}
                    </li>
                  ))}
                </ul>
              )}
              {c.in_review ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="Reply to the buyer and seller as Gadgets Bidding team"
                  />
                  <Button
                    variant="secondary"
                    disabled={!reply.trim() || busy === 'reply'}
                    onClick={() =>
                      run('reply', () => adminApi.disputeMessage(c.id, reply), 'Message sent').then(() => setReply(''))
                    }
                  >
                    Send message
                  </Button>
                </div>
              ) : null}
            </section>

            {c.in_review ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Next step the buyer sees</h3>
                <p className="text-xs text-muted-foreground">
                  One short line under "Team review" in the app, like "Hub re-test tomorrow".
                </p>
                <div className="flex gap-2">
                  <input
                    value={nextStep}
                    onChange={e => setNextStep(e.target.value.slice(0, 120))}
                    placeholder="Hub re-test tomorrow"
                    aria-label="Next step the buyer sees"
                    className="h-10 flex-1 rounded-[12px] border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-blue-brand"
                  />
                  <Button
                    variant="secondary"
                    disabled={busy === 'next' || nextStep.trim() === (c.next_step ?? '')}
                    onClick={() => run('next', () => adminApi.disputeNextStep(c.id, nextStep), 'Next step updated')}
                  >
                    Save
                  </Button>
                </div>
              </section>
            ) : null}

            {c.in_review ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Decision</h3>
                <Textarea
                  value={findings}
                  onChange={e => setFindings(e.target.value)}
                  placeholder="What our team found (the buyer and seller see this)"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={findings.trim().length < 10 || !!busy}
                    onClick={() => run('refund', () => adminApi.decideDispute(c.id, 'refund', findings), 'Refund decided')}
                  >
                    Refund the buyer
                  </Button>
                  <Button
                    variant="outline"
                    disabled={findings.trim().length < 10 || !!busy}
                    onClick={() =>
                      run('not_upheld', () => adminApi.decideDispute(c.id, 'not_upheld', findings), 'Marked not upheld')
                    }
                  >
                    Not upheld · pay the seller
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A refund holds the seller's money until the item is back at the hub. Not upheld releases it to the seller.
                </p>
              </section>
            ) : null}

            {decided && c.findings ? (
              <section className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">What our team found</h3>
                <p className="text-sm text-muted-foreground">{c.findings}</p>
              </section>
            ) : null}

            {c.outcome === 'refund' ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Return</h3>
                {c.return ? (
                  <>
                    <p className="text-sm">
                      Code <span className="font-mono font-medium">{c.return.code}</span> ·{' '}
                      {c.return.method === 'pickup' ? 'Rider pickup' : 'Drop-off at hub'} · due {when(c.return.due_at)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {c.return.status === 'refunded'
                        ? `Refunded ${when(c.return.refunded_at)} to ${c.return.refund_destination === 'card' ? 'their card' : 'their wallet'}`
                        : c.return.status === 'received'
                          ? 'Received at the hub. Refund in progress.'
                          : 'Waiting for the item to reach the hub.'}
                    </p>
                    {c.return.status !== 'refunded' && sellerReview ? (
                      <p className="text-sm text-[#DB7A2E]">
                        The seller asked for a second review. Decide it again before refunding the buyer.
                      </p>
                    ) : c.return.status !== 'refunded' ? (
                      <Button
                        disabled={busy === 'received'}
                        onClick={() =>
                          run('received', () => adminApi.disputeReturnReceived(c.id), 'Refund started')
                        }
                      >
                        Mark received and refund {money(c.order.total_amount)}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">The buyer hasn't started the return yet.</p>
                )}
                {back ? (
                  <div className="flex flex-col gap-2 border-t border-line pt-3">
                    <h4 className="text-sm font-medium">Back to the seller</h4>
                    <p className="text-sm text-muted-foreground">
                      {back.method === 'deliver'
                        ? `Rider to their shop · ${money(back.delivery_fee)} off their next payout${
                            back.charge ? ` (${back.charge.status})` : ''
                          }`
                        : back.method === 'collect'
                          ? `They'll collect it from the hub · code ${back.code} · free for ${back.free_days} days`
                          : "The seller hasn't chosen how to get it back yet."}
                    </p>
                    {back.returned_at ? (
                      <p className="text-sm text-muted-foreground">Handed back {when(back.returned_at)}.</p>
                    ) : c.return && ['received', 'refunded'].includes(c.return.status) ? (
                      <Button
                        variant="secondary"
                        className="self-start"
                        disabled={busy === 'handback'}
                        onClick={() => run('handback', () => adminApi.disputeReturnedToSeller(c.id), 'Marked as handed back')}
                      >
                        Handed back to the seller
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">You can hand it back once it's at the hub.</p>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
