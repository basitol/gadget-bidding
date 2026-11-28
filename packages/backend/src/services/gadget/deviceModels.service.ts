/**
 * Models offered by "List a gadget" step 1 (device_models), and the admin page that keeps the
 * list current ("our team adds new models within a day").
 */
import { query } from '../../config/database';
import { LISTING_CATEGORIES, profileByKey, type ListingCategoryKey } from '@gadget-bidding/shared';

export type DeviceModelItem = { id: string; name: string; brand: string; profile: string; category: string };

export const isCategoryKey = (v: unknown): v is ListingCategoryKey =>
  typeof v === 'string' && LISTING_CATEGORIES.some(c => c.key === v);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`);

const tidy = (q: string) => q.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * Case-insensitive search over name, brand and aliases, best matches first (max 12).
 * Empty q: the popular ones (seeded order, nudged by what's been listed in the last 180 days).
 */
export const searchModels = async (q: string, category?: ListingCategoryKey, limit = 12): Promise<DeviceModelItem[]> => {
  const term = tidy(q);
  const params: unknown[] = [];
  const where = ['m.is_active'];
  if (category) {
    params.push(category);
    where.push(`m.category_key = $${params.length}`);
  }

  if (!term) {
    params.push(limit);
    const rows = await query<DeviceModelItem>(
      `SELECT m.id, m.name, m.brand, m.profile_key AS profile, m.category_key AS category
       FROM device_models m
       LEFT JOIN (
         SELECT lower(g.model) AS model, COUNT(*)::int AS n FROM gadgets g
         WHERE g.created_at >= NOW() - INTERVAL '180 days' AND g.model IS NOT NULL
         GROUP BY 1
       ) recent ON recent.model = lower(m.name)
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(recent.n, 0) DESC, m.sort_rank ASC, m.name ASC
       LIMIT $${params.length}`,
      params
    );
    return rows;
  }

  // Every word has to appear somewhere (name, brand or an alias); "iphone15pro" also matches.
  const hay = `lower(m.brand || ' ' || m.name || ' ' || array_to_string(m.aliases, ' '))`;
  const words = term.split(' ').slice(0, 6);
  const wordConds = words.map(w => {
    params.push(`%${escapeLike(w)}%`);
    return `${hay} LIKE $${params.length}`;
  });
  params.push(`%${escapeLike(term.replace(/\s/g, ''))}%`);
  const squashed = `replace(${hay}, ' ', '') LIKE $${params.length}`;
  where.push(`((${wordConds.join(' AND ')}) OR ${squashed})`);

  params.push(term);
  const t = `$${params.length}`;
  params.push(term.replace(/\s/g, ''));
  const squashedTerm = `$${params.length}`;
  params.push(`${escapeLike(term)}%`);
  const starts = `$${params.length}`;
  params.push(`% ${escapeLike(term)}%`);
  const wordStart = `$${params.length}`;
  params.push(limit);

  return query<DeviceModelItem>(
    `SELECT m.id, m.name, m.brand, m.profile_key AS profile, m.category_key AS category
     FROM device_models m
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE
         WHEN lower(m.name) = ${t} OR lower(m.brand || ' ' || m.name) = ${t}
           OR replace(lower(m.name), ' ', '') = ${squashedTerm} THEN 0
         WHEN EXISTS (SELECT 1 FROM unnest(m.aliases) a WHERE lower(a) = ${t}) THEN 1
         WHEN lower(m.name) LIKE ${starts} OR lower(m.brand || ' ' || m.name) LIKE ${starts} THEN 2
         WHEN EXISTS (SELECT 1 FROM unnest(m.aliases) a WHERE lower(a) LIKE ${starts}) THEN 3
         WHEN lower(m.name) LIKE ${wordStart} THEN 4
         ELSE 5
       END,
       m.sort_rank ASC,
       length(m.name) ASC,
       m.name ASC
     LIMIT $${params.length}`,
    params
  );
};

type ModelRow = { id: string; name: string; brand: string; profile_key: string; category_key: string; is_active: boolean };

export const getModel = async (id: string) => {
  const rows = await query<ModelRow>(
    'SELECT id, name, brand, profile_key, category_key, is_active FROM device_models WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
};

/** The model a seller typed, when it's one of ours (same name, ignoring case). */
export const getModelByName = async (name: string) => {
  const rows = await query<ModelRow>(
    'SELECT id, name, brand, profile_key, category_key, is_active FROM device_models WHERE lower(name) = lower($1)',
    [name]
  );
  return rows[0] ?? null;
};

/* ---------------- Admin ---------------- */

export type AdminDeviceModel = {
  id: string;
  name: string;
  brand: string;
  profile: string;
  profile_label: string | null;
  category: string;
  category_label: string | null;
  aliases: string[];
  is_active: boolean;
  created_at: string;
  added_by: { id: string; full_name: string | null } | null;
  listings: number;
};

const categoryLabel = (key: string) => LISTING_CATEGORIES.find(c => c.key === key)?.label ?? null;

const toAdmin = (r: any): AdminDeviceModel => ({
  id: r.id,
  name: r.name,
  brand: r.brand,
  profile: r.profile_key,
  profile_label: profileByKey(r.profile_key)?.label ?? null,
  category: r.category_key,
  category_label: categoryLabel(r.category_key),
  aliases: r.aliases ?? [],
  is_active: r.is_active,
  created_at: new Date(r.created_at).toISOString(),
  added_by: r.added_by ? { id: r.added_by, full_name: r.added_by_name ?? null } : null,
  listings: Number(r.listings ?? 0),
});

const ADMIN_SELECT = `
  SELECT m.*, u.full_name AS added_by_name,
         (SELECT COUNT(*)::int FROM gadgets g WHERE lower(g.model) = lower(m.name)) AS listings
  FROM device_models m
  LEFT JOIN users u ON u.id = m.added_by`;

export const adminListModels = async (filters: {
  search?: string;
  category?: string;
  status?: 'active' | 'inactive' | 'all';
  page: number;
  limit: number;
}) => {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters.status === 'active') where.push('m.is_active');
  if (filters.status === 'inactive') where.push('NOT m.is_active');
  if (filters.category && isCategoryKey(filters.category)) {
    params.push(filters.category);
    where.push(`m.category_key = $${params.length}`);
  }
  const term = tidy(filters.search ?? '');
  if (term) {
    params.push(`%${escapeLike(term)}%`);
    where.push(
      `lower(m.brand || ' ' || m.name || ' ' || array_to_string(m.aliases, ' ') || ' ' || m.profile_key) LIKE $${params.length}`
    );
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [count] = await query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM device_models m ${clause}`, params);
  const rows = await query(
    `${ADMIN_SELECT} ${clause}
     ORDER BY m.created_at DESC, m.category_key ASC, m.sort_rank ASC, m.name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.limit, (filters.page - 1) * filters.limit]
  );
  return { items: rows.map(toAdmin), total: count?.total ?? 0 };
};

export class DeviceModelError extends Error {
  status = 400;
}

const cleanAliases = (aliases: unknown): string[] => {
  if (aliases == null) return [];
  const list = Array.isArray(aliases) ? aliases : typeof aliases === 'string' ? aliases.split(',') : null;
  if (!list) throw new DeviceModelError('Other names should be a list, separated by commas.');
  const out = Array.from(
    new Set(
      list
        .filter((a): a is string => typeof a === 'string')
        .map(a => a.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    )
  );
  if (out.length > 12) throw new DeviceModelError('Keep it to 12 other names or fewer.');
  if (out.some(a => a.length > 60)) throw new DeviceModelError('Each other name has to be under 60 characters.');
  return out;
};

const cleanName = (v: unknown, what: string, max: number) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (s.length < 2) throw new DeviceModelError(`Add the ${what}.`);
  if (s.length > max) throw new DeviceModelError(`Keep the ${what} under ${max} characters.`);
  return s;
};

const nameTaken = async (name: string, exceptId?: string) => {
  const rows = await query('SELECT id FROM device_models WHERE lower(name) = lower($1) AND ($2::uuid IS NULL OR id <> $2)', [
    name,
    exceptId ?? null,
  ]);
  return rows.length > 0;
};

export const adminCreateModel = async (
  adminId: string,
  body: { name?: unknown; brand?: unknown; profile?: unknown; category?: unknown; aliases?: unknown }
): Promise<AdminDeviceModel> => {
  const name = cleanName(body.name, 'model name', 120);
  const brand = cleanName(body.brand, 'brand', 60);
  const profile = profileByKey(typeof body.profile === 'string' ? body.profile : null);
  if (!profile) throw new DeviceModelError('Pick what kind of device it is.');
  const category = body.category == null || body.category === '' ? profile.category : body.category;
  if (!isCategoryKey(category)) throw new DeviceModelError('Pick a category.');
  const aliases = cleanAliases(body.aliases);
  if (await nameTaken(name)) throw new DeviceModelError(`${name} is already in the list.`);
  const [row] = await query<{ id: string }>(
    `INSERT INTO device_models (name, brand, profile_key, category_key, aliases, added_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name, brand, profile.key, category, aliases, adminId]
  );
  const [full] = await query(`${ADMIN_SELECT} WHERE m.id = $1`, [row.id]);
  return toAdmin(full);
};

export const adminUpdateModel = async (
  id: string,
  body: { name?: unknown; brand?: unknown; profile?: unknown; category?: unknown; aliases?: unknown; is_active?: unknown }
): Promise<{ before: AdminDeviceModel; after: AdminDeviceModel }> => {
  const [existing] = await query(`${ADMIN_SELECT} WHERE m.id = $1`, [id]);
  if (!existing) {
    const e = new DeviceModelError('That model is no longer in the list.');
    e.status = 404;
    throw e;
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (body.name !== undefined) {
    const name = cleanName(body.name, 'model name', 120);
    if (await nameTaken(name, id)) throw new DeviceModelError(`${name} is already in the list.`);
    set('name', name);
  }
  if (body.brand !== undefined) set('brand', cleanName(body.brand, 'brand', 60));
  if (body.profile !== undefined) {
    const profile = profileByKey(typeof body.profile === 'string' ? body.profile : null);
    if (!profile) throw new DeviceModelError('Pick what kind of device it is.');
    set('profile_key', profile.key);
    if (body.category === undefined) set('category_key', profile.category);
  }
  if (body.category !== undefined) {
    if (!isCategoryKey(body.category)) throw new DeviceModelError('Pick a category.');
    set('category_key', body.category);
  }
  if (body.aliases !== undefined) set('aliases', cleanAliases(body.aliases));
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') throw new DeviceModelError('is_active has to be true or false.');
    set('is_active', body.is_active);
  }
  if (!sets.length) throw new DeviceModelError('Nothing to change.');
  params.push(id);
  await query(`UPDATE device_models SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  const [after] = await query(`${ADMIN_SELECT} WHERE m.id = $1`, [id]);
  return { before: toAdmin(existing), after: toAdmin(after) };
};
