import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import config from '../../config';
import logger from '../../utils/logger';
import { isCloudinaryEnabled } from '../media/cloudinary.service';

/**
 * Seller verification documents are private: only our verification team sees them.
 * - Cloudinary (when set up): uploaded with type "private", shown through short-lived signed download links.
 * - Otherwise: kept in private-uploads/ (never served statically), shown through short-lived signed links
 *   to GET /api/v1/files/private/:name.
 * Stored references look like "cloudinary:<resource_type>:<public_id>:<format>" or "local:<file name>".
 */

export const PRIVATE_DIR = path.join(process.cwd(), 'private-uploads');
const LINK_TTL_SECONDS = 10 * 60;

if (!fs.existsSync(PRIVATE_DIR)) fs.mkdirSync(PRIVATE_DIR, { recursive: true });

const removeQuietly = (p: string) => fs.promises.unlink(p).catch(() => logger.warn(`Could not delete temp upload: ${p}`));

const configureCloudinary = () =>
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });

/** Moves an uploaded temp file into private storage and returns the stored reference. */
export const storePrivateFile = async (localPath: string, mime: string, folder: string): Promise<string> => {
  const isPdf = mime === 'application/pdf';
  if (isCloudinaryEnabled()) {
    configureCloudinary();
    try {
      const result = await cloudinary.uploader.upload(localPath, {
        folder: `gadget-bidding/private/${folder}`,
        type: 'private',
        // PDFs as images too, so the team can see a preview of page 1.
        resource_type: 'image',
      });
      logger.info(`Private upload: ${result.public_id}`);
      return `cloudinary:image:${result.public_id}:${result.format || (isPdf ? 'pdf' : 'jpg')}`;
    } finally {
      removeQuietly(localPath);
    }
  }
  const ext = isPdf ? '.pdf' : path.extname(localPath).toLowerCase() || '.jpg';
  const name = `${folder}-${crypto.randomBytes(16).toString('hex')}${ext}`;
  await fs.promises.rename(localPath, path.join(PRIVATE_DIR, name));
  return `local:${name}`;
};

const signLocal = (name: string, exp: number) =>
  crypto.createHmac('sha256', config.jwt.secret).update(`private-file:${name}:${exp}`).digest('hex');

/** A link that works for 10 minutes. `asImage` turns HEIC photos into JPEG so any browser can show them. */
export const privateFileUrl = (stored: string, opts: { asImage?: boolean } = {}): string | null => {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  if (stored.startsWith('cloudinary:')) {
    if (!isCloudinaryEnabled()) return null;
    configureCloudinary();
    const [, resourceType, ...rest] = stored.split(':');
    const format = rest.pop()!;
    const publicId = rest.join(':');
    const outFormat = opts.asImage ? (format === 'pdf' ? 'jpg' : format === 'heic' || format === 'heif' ? 'jpg' : format) : format;
    return cloudinary.utils.private_download_url(publicId, outFormat, {
      resource_type: resourceType,
      type: 'private',
      expires_at: exp,
    });
  }
  if (stored.startsWith('local:')) {
    const name = stored.slice('local:'.length);
    return `/api/${config.apiVersion}/files/private/${encodeURIComponent(name)}?exp=${exp}&sig=${signLocal(name, exp)}`;
  }
  return null;
};

/** For GET /files/private/:name — the path to stream, or null when the link is wrong or has expired. */
export const resolveLocalPrivateFile = (name: string, exp: string, sig: string): string | null => {
  if (!/^[a-z_]+-[a-f0-9]{32}\.(jpg|jpeg|png|webp|heic|heif|pdf)$/i.test(name)) return null;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() / 1000) return null;
  const want = signLocal(name, expNum);
  if (!sig || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const file = path.join(PRIVATE_DIR, name);
  return fs.existsSync(file) ? file : null;
};

/** Best effort: removes a replaced document. */
export const deletePrivateFile = async (stored: string): Promise<void> => {
  try {
    if (stored.startsWith('cloudinary:') && isCloudinaryEnabled()) {
      configureCloudinary();
      const [, resourceType, ...rest] = stored.split(':');
      rest.pop();
      await cloudinary.uploader.destroy(rest.join(':'), { type: 'private', resource_type: resourceType });
    } else if (stored.startsWith('local:')) {
      await fs.promises.unlink(path.join(PRIVATE_DIR, stored.slice('local:'.length)));
    }
  } catch (err) {
    logger.warn(`Could not delete private file ${stored}: ${(err as Error).message}`);
  }
};
