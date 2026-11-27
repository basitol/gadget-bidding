import prisma from '../../config/prisma';
import { query } from '../../config/database';
import logger from '../../utils/logger';
import * as notificationService from '../notification/notification.service';

const MAX_PER_USER = 20;
/** Auctions that went live within this window are checked against saved searches. */
const MATCH_WINDOW_MINUTES = 15;

/** Gadget conditions that satisfy each alert condition (grades: excellent = A, good = B). */
export const CONDITION_MATCHES: Record<string, string[]> = {
  new: ['new'],
  a_or_better: ['new', 'like_new', 'excellent'],
  b_or_better: ['new', 'like_new', 'excellent', 'good'],
};
const CONDITIONS = Object.keys(CONDITION_MATCHES);

const toPublic = (s: any, newThisWeek = 0) => ({
  id: s.id,
  query: s.query,
  category_slug: s.categorySlug,
  max_price: s.maxPrice != null ? Number(s.maxPrice) : null,
  condition: s.condition ?? null,
  enabled: s.isEnabled,
  new_this_week: newThisWeek,
  label: s.query || s.categorySlug || 'Any gadget',
  created_at: s.createdAt.toISOString(),
});

export const create = async (
  userId: string,
  input: { query?: string; category_slug?: string; max_price?: number; condition?: string | null }
) => {
  const q = input.query?.trim().slice(0, 120) || null;
  const category = input.category_slug?.trim() || null;
  if (!q && !category) throw new Error('Tell us what to look for');
  const condition = input.condition && input.condition !== 'any' ? input.condition : null;
  if (condition && !CONDITIONS.includes(condition)) throw new Error('Pick a condition from the list');
  if ((await prisma.savedSearch.count({ where: { userId } })) >= MAX_PER_USER) {
    throw new Error(`You can save up to ${MAX_PER_USER} alerts. Remove one first.`);
  }
  const maxPrice = input.max_price ?? null;
  // Saving the same alert twice just turns the existing one back on.
  const existing = await prisma.savedSearch.findFirst({
    where: { userId, query: q, categorySlug: category, condition, maxPrice },
  });
  const saved = existing
    ? await prisma.savedSearch.update({ where: { id: existing.id }, data: { isEnabled: true } })
    : await prisma.savedSearch.create({
        data: { userId, query: q, categorySlug: category, maxPrice, condition },
      });
  return toPublic(saved);
};

/** Matches sent for each alert in the last 7 days ("2 new this week"). */
const weeklyMatches = async (userId: string): Promise<Map<string, number>> => {
  const rows = await query(
    `SELECT data->>'savedSearchId' AS id, COUNT(*)::int AS n
     FROM notifications
     WHERE user_id = $1 AND notification_type = 'saved_search_match'
       AND created_at >= NOW() - INTERVAL '7 days'
     GROUP BY 1`,
    [userId]
  );
  return new Map(rows.map((r: any) => [r.id, Number(r.n)]));
};

export const list = async (userId: string) => {
  const [rows, counts] = await Promise.all([
    prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    weeklyMatches(userId),
  ]);
  return rows.map(s => toPublic(s, counts.get(s.id) ?? 0));
};

/** Turn an alert on or off without losing it. */
export const setEnabled = async (userId: string, id: string, enabled: boolean) => {
  const found = await prisma.savedSearch.findFirst({ where: { id, userId } });
  if (!found) throw new Error('That alert no longer exists');
  const updated = await prisma.savedSearch.update({ where: { id }, data: { isEnabled: enabled } });
  return toPublic(updated, (await weeklyMatches(userId)).get(id) ?? 0);
};

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
      AND s.is_enabled
      AND (s.condition IS NULL
           OR (s.condition = 'new' AND g.condition = 'new')
           OR (s.condition = 'a_or_better' AND g.condition IN ('new', 'like_new', 'excellent'))
           OR (s.condition = 'b_or_better' AND g.condition IN ('new', 'like_new', 'excellent', 'good')))
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
