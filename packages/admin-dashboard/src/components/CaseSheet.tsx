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
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!disputeId) return;
    try {
      const data = (await adminApi.disputeCase(disputeId)).data;
      setC(data);
      setNextStep(data?.next_step ?? '');
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
      toast.success(ok);
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  const decided = c && !c.in_review;

  return (
    <Sheet open={!!disputeId} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
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
              <p className="text-xs text-muted-foreground">Reported {when(c.created_at)}</p>
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
                  placeholder="What our team found (the buyer sees this)"
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
                    {c.return.status !== 'refunded' ? (
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
              </section>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
