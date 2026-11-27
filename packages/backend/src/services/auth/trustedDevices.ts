import { createHash } from 'crypto';
import prisma from '../../config/prisma';

/**
 * Phones that passed 2-step sign-in. Only a hash of the app's device id is
 * stored. A trusted phone isn't asked for a code again until 2-step is turned
 * off or its method changes.
 */

export const MAX_TRUSTED_DEVICES = 10;

export const hashDeviceId = (deviceId: string) => createHash('sha256').update(deviceId.trim()).digest('hex');

/** True (and marks it used) when this phone already passed 2-step for this user. */
export const isTrustedDevice = async (userId: string, deviceHash: string): Promise<boolean> => {
  const device = await prisma.trustedDevice.findUnique({
    where: { userId_deviceHash: { userId, deviceHash } },
    select: { id: true },
  });
  if (!device) return false;
  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return true;
};

/** Trust a phone; keeps the 10 most recently used and drops the rest. */
export const trustDevice = async (userId: string, deviceHash: string, label?: string | null) => {
  const now = new Date();
  await prisma.trustedDevice.upsert({
    where: { userId_deviceHash: { userId, deviceHash } },
    create: { userId, deviceHash, label: label || null },
    update: { lastUsedAt: now, ...(label ? { label } : {}) },
  });
  const stale = await prisma.trustedDevice.findMany({
    where: { userId },
    orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    skip: MAX_TRUSTED_DEVICES,
    select: { id: true },
  });
  if (stale.length) {
    await prisma.trustedDevice.deleteMany({ where: { id: { in: stale.map(d => d.id) } } });
  }
};

export const forgetTrustedDevices = (userId: string, db: Pick<typeof prisma, 'trustedDevice'> = prisma) =>
  db.trustedDevice.deleteMany({ where: { userId } });
