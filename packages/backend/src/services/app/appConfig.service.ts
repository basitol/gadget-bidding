import prisma from '../../config/prisma';
import logger from '../../utils/logger';

/**
 * What the mobile app checks at launch and on every return to the foreground:
 * - release settings (minimum / latest version, store links, "What's new") — the app blocks
 *   itself with "Time to update" below the minimum;
 * - maintenance — bidding paused for everyone; when it ends, every auction it overlapped gets the
 *   lost time added back to its end time (once, in the same transaction that ends the window).
 *
 * Release settings live in app_settings (one row). Any empty field falls back to env.
 */

export const GATE_CODES = {
  MAINTENANCE: 'MAINTENANCE',
  APP_UPDATE_REQUIRED: 'APP_UPDATE_REQUIRED',
} as const;

export const APP_VERSION_HEADER = 'x-app-version';

/* ---------------- Versions ---------------- */

const VERSION_RE = /^\d+(\.\d+){0,2}$/;

export const isValidVersion = (v: unknown): v is string => typeof v === 'string' && VERSION_RE.test(v.trim());

/** -1 / 0 / 1, comparing "2.1.0" style versions part by part ("2.1" == "2.1.0"). */
export const compareVersions = (a: string, b: string): number => {
  const pa = a.trim().split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.trim().split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
};

/* ---------------- Errors the bid routes turn into gate screens ---------------- */

export class MaintenanceError extends Error {
  code = GATE_CODES.MAINTENANCE;
  constructor(public maintenance: MaintenanceState) {
    super(
      maintenance.back_by
        ? 'Bidding is paused for maintenance. Every running auction gets the lost time added back.'
        : 'Bidding is paused for maintenance. Try again soon.'
    );
  }
}

export class AppUpdateRequiredError extends Error {
  code = GATE_CODES.APP_UPDATE_REQUIRED;
  constructor(public release: ReleaseSettings, public installed: string) {
    super('This version of Gadgets Bidding is too old to bid safely. Update the app to keep bidding.');
  }
}

export const isGateError = (e: unknown): e is MaintenanceError | AppUpdateRequiredError =>
  e instanceof MaintenanceError || e instanceof AppUpdateRequiredError;

/* ---------------- Release settings ---------------- */

export type ReleaseSettings = {
  min_version: string;
  latest_version: string;
  store_urls: { ios: string | null; android: string | null };
  whats_new: string[];
  updated_at: string | null;
};

const env = (name: string) => (process.env[name] || '').trim();

const envRelease = () => {
  const min = isValidVersion(env('APP_MIN_VERSION')) ? env('APP_MIN_VERSION') : '1.0.0';
  const latest = isValidVersion(env('APP_LATEST_VERSION')) ? env('APP_LATEST_VERSION') : min;
  return {
    min,
    latest: compareVersions(latest, min) < 0 ? min : latest,
    ios: env('APP_IOS_STORE_URL') || null,
    android: env('APP_ANDROID_STORE_URL') || 'https://play.google.com/store/apps/details?id=com.gadgetbid.app',
    // "Faster live bidding|Pay by bank transfer and USSD"
    whatsNew: env('APP_WHATS_NEW')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean),
  };
};

const cleanLines = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(s => String(s ?? '').trim()).filter(Boolean).slice(0, 8) : [];

export const getReleaseSettings = async (): Promise<ReleaseSettings> => {
  const row = await prisma.appSetting.findUnique({ where: { id: 1 } });
  const d = envRelease();
  const lines = cleanLines(row?.whatsNew);
  return {
    min_version: row?.minAppVersion || d.min,
    latest_version: row?.latestAppVersion || d.latest,
    store_urls: { ios: row?.iosStoreUrl || d.ios, android: row?.androidStoreUrl || d.android },
    whats_new: row?.whatsNew != null ? lines : d.whatsNew,
    updated_at: row?.updatedAt?.toISOString() ?? null,
  };
};

export type ReleaseInput = {
  min_version: string;
  latest_version: string;
  ios_store_url?: string | null;
  android_store_url?: string | null;
  whats_new?: string[];
};

const httpsUrl = (v: unknown, label: string): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!['https:', 'itms-apps:', 'market:'].includes(u.protocol)) throw new Error();
  } catch {
    throw new Error(`${label} must be a full https:// link`);
  }
  if (s.length > 500) throw new Error(`${label} is too long`);
  return s;
};

export const updateReleaseSettings = async (adminId: string, input: ReleaseInput) => {
  const min = String(input.min_version ?? '').trim();
  const latest = String(input.latest_version ?? '').trim();
  if (!isValidVersion(min)) throw new Error('Minimum version must look like 2.3.0');
  if (!isValidVersion(latest)) throw new Error('Latest version must look like 2.4.0');
  if (compareVersions(min, latest) > 0) throw new Error('Minimum version can’t be newer than the latest version');
  const lines = cleanLines(input.whats_new);
  if (lines.some(l => l.length > 120)) throw new Error('Keep each "What’s new" line under 120 characters');

  const data = {
    minAppVersion: min,
    latestAppVersion: latest,
    iosStoreUrl: httpsUrl(input.ios_store_url, 'App Store link'),
    androidStoreUrl: httpsUrl(input.android_store_url, 'Google Play link'),
    whatsNew: lines,
    updatedBy: adminId,
    updatedAt: new Date(),
  };
  await prisma.appSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  invalidateAppConfigCache();
  return getReleaseSettings();
};

/* ---------------- Maintenance ---------------- */

export type MaintenanceState = {
  active: boolean;
  id: string | null;
  started_at: string | null;
  back_by: string | null;
  message: string | null;
};

const NOT_ACTIVE: MaintenanceState = { active: false, id: null, started_at: null, back_by: null, message: null };

type WindowRow = Awaited<ReturnType<typeof prisma.maintenanceWindow.findFirst>>;

const toState = (w: WindowRow): MaintenanceState =>
  w
    ? {
        active: true,
        id: w.id,
        started_at: w.startedAt.toISOString(),
        back_by: w.backBy?.toISOString() ?? null,
        message: w.message ?? null,
      }
    : NOT_ACTIVE;

/** Straight from the database (the bid transaction and the auction job use this). */
export const getOpenWindow = (client: Pick<typeof prisma, 'maintenanceWindow'> = prisma) =>
  client.maintenanceWindow.findFirst({ where: { endedAt: null }, orderBy: { startedAt: 'desc' } });

export const getMaintenance = async (): Promise<MaintenanceState> => toState(await getOpenWindow());

export const isMaintenanceActive = async () => !!(await getOpenWindow());

/**
 * Inside placeBid's transaction: refuse while maintenance is on. Covers REST, socket and
 * auto-bid placement in one place.
 */
export const assertBiddingOpen = async (client: Pick<typeof prisma, 'maintenanceWindow'>) => {
  const w = await getOpenWindow(client);
  if (w) throw new MaintenanceError(toState(w));
};

/** Auctions the pause would add time to if it ended now (for the admin's confirm dialog). */
export const countAffectedAuctions = async (startedAt: Date) =>
  prisma.auction.count({
    where: { status: { in: ['active', 'scheduled'] }, endTime: { gt: startedAt }, startTime: { lt: new Date() } },
  });

export const startMaintenance = async (
  adminId: string,
  input: { back_by?: string | null; message?: string | null; reason?: string | null }
) => {
  const now = new Date();
  let backBy: Date | null = null;
  if (input.back_by) {
    backBy = new Date(input.back_by);
    if (Number.isNaN(backBy.getTime())) throw new Error('Choose when you expect to be back');
    if (backBy.getTime() <= now.getTime()) throw new Error('"Back by" must be in the future');
    if (backBy.getTime() - now.getTime() > 7 * 24 * 3_600_000) throw new Error('"Back by" must be within 7 days');
  }
  const message = (input.message || '').trim().slice(0, 280) || null;
  const reason = (input.reason || '').trim().slice(0, 280) || null;

  const created = await prisma.$transaction(async tx => {
    if (await getOpenWindow(tx)) throw new Error('Maintenance is already on');
    return tx.maintenanceWindow.create({
      data: { startedAt: now, backBy, message, reason, startedBy: adminId },
    });
  }).catch((e: any) => {
    // Two admins pressing Start together: the partial unique index lets only one through.
    if (e?.code === 'P2002' || /maintenance_windows_one_open|23505/.test(String(e?.message))) {
      throw new Error('Maintenance is already on');
    }
    throw e;
  });
  invalidateAppConfigCache();
  logger.warn(`Maintenance started by ${adminId} (back by ${backBy?.toISOString() ?? 'unknown'})`);
  return created;
};

/** Change the estimate (or the note) while maintenance is on. */
export const updateMaintenance = async (input: { back_by?: string | null; message?: string | null }) => {
  const w = await getOpenWindow();
  if (!w) throw new Error('Maintenance is not on');
  const data: { backBy?: Date | null; message?: string | null } = {};
  if (input.back_by !== undefined) {
    const d = input.back_by ? new Date(input.back_by) : null;
    if (d && (Number.isNaN(d.getTime()) || d.getTime() <= Date.now())) throw new Error('"Back by" must be in the future');
    data.backBy = d;
  }
  if (input.message !== undefined) data.message = (input.message || '').trim().slice(0, 280) || null;
  const updated = await prisma.maintenanceWindow.update({ where: { id: w.id }, data });
  invalidateAppConfigCache();
  return updated;
};

export type MaintenanceEnded = {
  id: string;
  started_at: string;
  ended_at: string;
  paused_seconds: number;
  auctions_extended: number;
  extended: { id: string; end_time: string }[];
};

/**
 * End the open window and add the lost time back, atomically and only once:
 * the conditional update (ended_at IS NULL) lets exactly one caller win the row; the auction
 * update runs in the same transaction, so either both happen or neither does.
 *
 * Each auction gets back the bidding time it lost: ended_at − max(start_time, started_at).
 * - running when maintenance started → the full pause;
 * - due to start during it (left scheduled, the job doesn't activate during maintenance) →
 *   the part of its run that fell inside the pause, so it still gets its full length;
 * - already past its end before maintenance started → nothing (it ended before the pause).
 * All columns are UTC wall-clock timestamps, so the arithmetic never touches time zones.
 */
export const endMaintenance = async (adminId: string): Promise<MaintenanceEnded> => {
  const result = await prisma.$transaction(async tx => {
    const open = await getOpenWindow(tx);
    if (!open) throw new Error('Maintenance is not on');
    const endedAt = new Date();
    const won = await tx.maintenanceWindow.updateMany({
      where: { id: open.id, endedAt: null },
      data: { endedAt, endedBy: adminId },
    });
    if (won.count !== 1) throw new Error('Maintenance was already ended');

    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE auctions a
      SET end_time = a.end_time + (m.ended_at - GREATEST(a.start_time, m.started_at)),
          updated_at = (NOW() AT TIME ZONE 'UTC')
      FROM maintenance_windows m
      WHERE m.id = ${open.id}::uuid
        AND a.status IN ('active', 'scheduled')
        AND a.end_time > m.started_at
        AND a.start_time < m.ended_at
      RETURNING a.id`;

    const pausedSeconds = Math.max(0, Math.round((endedAt.getTime() - open.startedAt.getTime()) / 1000));
    await tx.maintenanceWindow.update({
      where: { id: open.id },
      data: { pausedSeconds, auctionsExtended: rows.length },
    });
    const extended = rows.length
      ? await tx.auction.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: { id: true, endTime: true } })
      : [];
    return {
      id: open.id,
      started_at: open.startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      paused_seconds: pausedSeconds,
      auctions_extended: rows.length,
      extended: extended.map(a => ({ id: a.id, end_time: a.endTime.toISOString() })),
    };
  });
  invalidateAppConfigCache();
  logger.warn(
    `Maintenance ${result.id} ended by ${adminId}: ${result.auctions_extended} auctions extended (${result.paused_seconds}s paused)`
  );
  return result;
};

export const recentWindows = async (limit = 5) => {
  const rows = await prisma.maintenanceWindow.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
  return rows.map(w => ({
    id: w.id,
    started_at: w.startedAt.toISOString(),
    back_by: w.backBy?.toISOString() ?? null,
    ended_at: w.endedAt?.toISOString() ?? null,
    message: w.message,
    reason: w.reason,
    paused_seconds: w.pausedSeconds,
    auctions_extended: w.auctionsExtended,
  }));
};

/* ---------------- Public config (cached) ---------------- */

export type PublicAppConfig = ReleaseSettings & { maintenance: MaintenanceState; server_time: string };

const CACHE_MS = 5_000;
let cache: { at: number; value: Omit<PublicAppConfig, 'server_time'> } | null = null;

export const invalidateAppConfigCache = () => {
  cache = null;
};

/** Cheap: one small query pair at most every 5s per instance. */
export const getPublicConfig = async (): Promise<PublicAppConfig> => {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const [release, maintenance] = await Promise.all([getReleaseSettings(), getMaintenance()]);
    cache = { at: Date.now(), value: { ...release, maintenance } };
  }
  return { ...cache.value, server_time: new Date().toISOString() };
};

/** Installed version below the minimum? (No header → old app or web: not checked.) */
export const checkAppVersion = async (installed: string | undefined) => {
  if (!installed || !isValidVersion(installed)) return;
  const cfg = await getPublicConfig();
  if (compareVersions(installed, cfg.min_version) < 0) {
    throw new AppUpdateRequiredError(cfg, installed.trim());
  }
};
