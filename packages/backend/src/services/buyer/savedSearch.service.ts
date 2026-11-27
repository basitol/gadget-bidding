import prisma from '../../config/prisma';
import { query } from '../../config/database';
import logger from '../../utils/logger';
import * as notificationService from '../notification/notification.service';

const MAX_PER_USER = 20;
/** Auctions that went live within this window are checked against saved searches. */
const MATCH_WINDOW_MINUTES = 15;

const toPublic = (s: any) => ({
  id: s.id,
  query: s.query,
  category_slug: s.categorySlug,
  max_price: s.maxPrice != null ? Number(s.maxPrice) : null,
  label: s.query || s.categorySlug || 'Any gadget',
  created_at: s.createdAt.toISOString(),
});

export const create = async (
  userId: string,
  input: { query?: string; category_slug?: string; max_price?: number }
) => {
  const q = input.query?.trim().slice(0, 120) || null;
  const category = input.category_slug?.trim() || null;
  if (!q && !category) throw new Error('Tell us what to look for');
  if ((await prisma.savedSearch.count({ where: { userId } })) >= MAX_PER_USER) {
    throw new Error(`You can save up to ${MAX_PER_USER} alerts. Remove one first.`);
  }
  // Saving the same alert twice is a no-op.
  const existing = await prisma.savedSearch.findFirst({
    where: { userId, query: q, categorySlug: category },
  });
  const saved =
    existing ??
    (await prisma.savedSearch.create({
      data: { userId, query: q, categorySlug: category, maxPrice: input.max_price ?? null },
    }));
  return toPublic(saved);
};

export const list = async (userId: string) =>
  (await prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })).map(toPublic);

export const remove = async (userId: string, id: string) => {
  await prisma.savedSearch.deleteMany({ where: { id, userId } });
};

/** Called by the auction job. Finds new live auctions that match someone's saved search. */
export const notifyNewMatches = async () => {
  const matches = await query(
    `SELECT DISTINCT ON (s.user_id, a.id)
            s.user_id, s.id AS search_id, a.id AS auction_id, g.title, a.current_price,
            COALESCE(s.query, c.name) AS label
     FROM auctions a
     JOIN gadgets g ON g.id = a.gadget_id
     LEFT JOIN gadget_categories c ON c.id = g.category_id
     JOIN saved_searches s ON
          (s.query IS NULL OR g.title ILIKE '%' || s.query || '%'
             OR COALESCE(g.brand, '') || ' ' || COALESCE(g.model, '') ILIKE '%' || s.query || '%')
      AND (s.category_slug IS NULL OR c.slug = s.category_slug)
      AND (s.max_price IS NULL OR a.current_price <= s.max_price)
     WHERE a.status = 'active'
       AND a.start_time >= NOW() - make_interval(mins => $1)
       AND a.end_time > NOW()
       AND s.user_id <> COALESCE(a.seller_id, '00000000-0000-0000-0000-000000000000'::uuid)
     LIMIT 500`,
    [MATCH_WINDOW_MINUTES]
  );

  for (const m of matches) {
    if (await notificationService.alreadyNotified(m.user_id, 'saved_search_match', 'auctionId', m.auction_id)) {
      continue;
    }
    await notificationService.createNotification(
      m.user_id,
      'saved_search_match',
      `Just listed: ${m.title}`,
      `A match for your "${m.label}" alert is live now at ₦${Number(m.current_price).toLocaleString()}.`,
      { auctionId: m.auction_id, savedSearchId: m.search_id },
      ['push']
    );
    await prisma.savedSearch
      .update({ where: { id: m.search_id }, data: { lastNotifiedAt: new Date() } })
      .catch(() => {});
  }
  if (matches.length) logger.info(`Saved-search alerts checked: ${matches.length} match(es)`);
};
