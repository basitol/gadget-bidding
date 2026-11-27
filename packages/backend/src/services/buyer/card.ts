/** Compact auction shape for list screens (watchlist, my bids). */
export const AUCTION_CARD_INCLUDE = {
  gadget: { select: { title: true, condition: true, images: true, category: { select: { slug: true } } } },
} as const;

const firstImage = (images: unknown): string | null => {
  if (Array.isArray(images)) return (images[0] as string) ?? null;
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed[0] ?? null : null;
    } catch {
      return images || null;
    }
  }
  return null;
};

export const toAuctionCard = (a: any) => ({
  id: a.id,
  title: a.gadget?.title ?? 'Gadget',
  condition: a.gadget?.condition ?? null,
  image: firstImage(a.gadget?.images),
  category_slug: a.gadget?.category?.slug ?? null,
  status: a.status,
  current_price: Number(a.currentPrice),
  starting_price: Number(a.startingPrice),
  bid_increment: Number(a.bidIncrement ?? 100),
  total_bids: a.totalBids ?? 0,
  start_time: a.startTime?.toISOString?.() ?? a.startTime,
  end_time: a.endTime?.toISOString?.() ?? a.endTime,
});
