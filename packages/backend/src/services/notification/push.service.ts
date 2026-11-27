import prisma from '../../config/prisma';
import logger from '../../utils/logger';

/**
 * Push notifications through Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Tokens come from the app (POST /notifications/push-token). Expo hands the message to APNs / FCM.
 *
 * Set EXPO_ACCESS_TOKEN if "Enhanced security for push notifications" is on in the Expo project.
 */

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const BATCH_SIZE = 100; // Expo's per-request limit
/** Expo recommends checking receipts ~15 minutes after sending. */
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export const isExpoPushToken = (token: string) => EXPO_TOKEN_RE.test(token);

export interface PushPayload {
  title: string;
  body: string;
  /** Sent to the app; used to open the right screen when tapped. */
  data?: Record<string, unknown>;
  /** iOS: time-sensitive alerts break through Focus (outbid, ending soon). */
  urgent?: boolean;
}

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

const headers = () => {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    h.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  return h;
};

/* ---------------- Token storage ---------------- */

export const registerToken = async (userId: string, token: string, platform: string) => {
  if (!isExpoPushToken(token)) throw new Error('Invalid push token');
  // A device moves to whoever is signed in on it now.
  await prisma.pushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform, updatedAt: new Date() },
  });
};

export const removeToken = async (userId: string, token: string) => {
  await prisma.pushToken.deleteMany({ where: { token, userId } });
};

const pruneTokens = async (tokens: string[]) => {
  if (!tokens.length) return;
  await prisma.pushToken.deleteMany({ where: { token: { in: tokens } } });
  logger.info(`Removed ${tokens.length} push token(s) for uninstalled apps`);
};

/* ---------------- Sending ---------------- */

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { errors?: unknown };
  if (!res.ok) {
    throw new Error(`Expo push ${res.status}: ${JSON.stringify((json as any).errors ?? json)}`);
  }
  return json;
};

const checkReceipts = async (ticketToToken: Map<string, string>) => {
  const ids = [...ticketToToken.keys()];
  const dead: string[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    try {
      const { data } = await postJson<{
        data: Record<string, { status: string; message?: string; details?: { error?: string } }>;
      }>(EXPO_RECEIPTS_URL, { ids: ids.slice(i, i + 300) });
      for (const [id, receipt] of Object.entries(data || {})) {
        if (receipt.status !== 'error') continue;
        if (receipt.details?.error === 'DeviceNotRegistered') {
          const token = ticketToToken.get(id);
          if (token) dead.push(token);
        } else {
          logger.warn(`Push receipt error: ${receipt.details?.error || receipt.message}`);
        }
      }
    } catch (err) {
      logger.warn('Could not fetch push receipts:', err);
    }
  }
  await pruneTokens(dead);
};

/** Sends to every device the users have registered. Never throws: push is best-effort. */
export const sendToUsers = async (userIds: string[], payload: PushPayload): Promise<number> => {
  if (process.env.PUSH_NOTIFICATIONS_DISABLED === 'true') return 0;
  try {
    const rows = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    if (!rows.length) return 0;

    const messages = rows.map(({ token }) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      ...(payload.urgent ? { interruptionLevel: 'time-sensitive' } : {}),
    }));

    const dead: string[] = [];
    const ticketToToken = new Map<string, string>();

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      try {
        const { data: tickets } = await postJson<{ data: ExpoTicket[] }>(EXPO_SEND_URL, batch);
        tickets.forEach((ticket, j) => {
          const token = batch[j].to;
          if (ticket.status === 'ok') ticketToToken.set(ticket.id, token);
          else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(token);
          else logger.warn(`Push ticket error: ${ticket.details?.error || ticket.message}`);
        });
      } catch (err) {
        logger.error('Expo push send failed:', err);
      }
    }

    await pruneTokens(dead);
    if (ticketToToken.size) {
      await prisma.pushToken.updateMany({
        where: { token: { in: [...ticketToToken.values()] } },
        data: { lastUsedAt: new Date() },
      });
      setTimeout(() => void checkReceipts(ticketToToken), RECEIPT_DELAY_MS).unref?.();
    }
    return ticketToToken.size;
  } catch (err) {
    logger.error('Push notification failed:', err);
    return 0;
  }
};

export const sendToUser = (userId: string, payload: PushPayload) => sendToUsers([userId], payload);
