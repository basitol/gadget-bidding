import { useCallback, useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { SectionCard } from '@/components/attention';
import { redOutline, secondary } from '@/components/SellerApplicationPanel';
import { Button } from '@/components/ui/button';
import { friendlyTime } from '@/lib/format';
import { listingAdditionsApi, type AdditionDecision, type ListingAddition } from '@/lib/listingAdditionsApi';
import { mediaUrl } from '@/lib/media';

/**
 * Added to live listings: photos and notes for bidders that sellers sent after the listing went live.
 * Nothing shows to buyers until it's approved here. Hidden when nothing is waiting.
 */
export function ListingAdditionsCard() {
  const { prompt } = useConfirmDialog();
  const [items, setItems] = useState<ListingAddition[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await listingAdditionsApi.list()).data);
    } catch {
      // The rest of the page still works; the card just doesn't show.
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!items?.length) return null;

  const decide = async (item: ListingAddition, body: AdditionDecision, key: string) => {
    let reason: string | undefined;
    if (body.reject_photos?.length || body.note === 'reject') {
      const r = await prompt('Why not?', '', {
        title: body.note === 'reject' ? 'Turn down this note' : 'Turn down this photo',
        description: 'The seller sees this, so say what to fix.',
        placeholder: 'e.g. The photo is of a different phone',
        confirmLabel: 'Turn down',
        required: true,
      });
      if (!r?.trim()) return;
      reason = r.trim();
    }
    setBusy(key);
    try {
      await listingAdditionsApi.decide(item.gadget_id, { ...body, reason });
      toast.success(
        body.reject_photos?.length || body.note === 'reject'
          ? 'Turned down. We told the seller.'
          : 'Approved. It shows on the listing now.'
      );
      await load();
    } catch (e: any) {
      toast.error('That didn’t go through', { description: e?.message });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const count = items.reduce((n, i) => n + i.pending_photos.length + (i.bidder_note_pending ? 1 : 0), 0);

  return (
    <SectionCard
      className="mb-6"
      icon={<ImagePlus className="size-5 text-blue-brand" aria-hidden />}
      title="Added to live listings"
      meta={`${count} to check`}
      description="Photos and notes sellers added after their listing went live. Buyers only see them once you approve."
    >
      <ul className="divide-y divide-line">
        {items.map(item => (
          <li key={item.gadget_id} className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-wrap items-start gap-3">
              {item.image ? (
                <img src={mediaUrl(item.image)} alt="" className="size-12 rounded-[12px] bg-fill object-cover" />
              ) : (
                <span className="size-12 rounded-[12px] bg-fill" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-ink">{item.title}</p>
                <p className="text-[13px] text-slate">
                  {[
                    item.seller?.name,
                    item.auction ? `${item.auction.bids} bid${item.auction.bids === 1 ? '' : 's'}` : 'Not running',
                    item.auction?.end_time ? `ends ${friendlyTime(item.auction.end_time)}` : null,
                    item.updated_at ? `sent ${friendlyTime(item.updated_at)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>

            {item.pending_photos.length ? (
              <div className="flex flex-wrap gap-4">
                {item.pending_photos.map(url => {
                  const key = `${item.gadget_id}:${url}`;
                  return (
                    <figure key={url} className="flex w-[168px] flex-col gap-2">
                      <a
                        href={mediaUrl(url)}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-visible:outline-2 focus-visible:outline-blue-brand"
                      >
                        <img
                          src={mediaUrl(url)}
                          alt="New photo from the seller"
                          className="h-[126px] w-[168px] rounded-[12px] bg-fill object-cover"
                        />
                      </a>
                      <div className="flex gap-2">
                        <Button
                          className="h-9 flex-1 rounded-[10px] text-[13px]"
                          disabled={busy === key}
                          onClick={() => decide(item, { approve_photos: [url] }, key)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          className={`${redOutline} h-9 flex-1 text-[13px]`}
                          disabled={busy === key}
                          onClick={() => decide(item, { reject_photos: [url] }, key)}
                        >
                          Turn down
                        </Button>
                      </div>
                    </figure>
                  );
                })}
              </div>
            ) : null}

            {item.bidder_note_pending ? (
              <div className="flex flex-col gap-3 rounded-[14px] bg-fill p-4">
                <p className="text-[13px] font-medium text-slate">Note for bidders</p>
                <p className="whitespace-pre-wrap text-[14px] text-ink">{item.bidder_note_pending}</p>
                {item.bidder_note ? <p className="text-[13px] text-slate">Replaces: “{item.bidder_note}”</p> : null}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className={secondary}
                    disabled={busy === `${item.gadget_id}:note`}
                    onClick={() => decide(item, { note: 'approve' }, `${item.gadget_id}:note`)}
                  >
                    Approve note
                  </Button>
                  <Button
                    variant="outline"
                    className={redOutline}
                    disabled={busy === `${item.gadget_id}:note`}
                    onClick={() => decide(item, { note: 'reject' }, `${item.gadget_id}:note`)}
                  >
                    Turn down
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
