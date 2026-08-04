import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import config from '../../config';
import logger from '../../utils/logger';

let configured = false;

export function isCloudinaryEnabled(): boolean {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  return Boolean(cloudName && apiKey && apiSecret);
}

function ensureConfigured(): void {
  if (configured) return;
  if (!isCloudinaryEnabled()) {
    throw new Error('Cloudinary is not configured');
  }
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
  configured = true;
}

/**
 * Upload a local temp file to Cloudinary and remove the local copy.
 */
export async function uploadLocalFile(localPath: string): Promise<string> {
  ensureConfigured();

  try {
    const result = await cloudinary.uploader.upload(localPath, {
      folder: 'gadget-bidding/gadgets',
      resource_type: 'image',
    });

    logger.info(`Cloudinary upload: ${result.public_id}`);

    return result.secure_url;
  } finally {
    try {
      fs.unlinkSync(localPath);
    } catch {
      logger.warn(`Could not delete temp upload: ${localPath}`);
    }
  }
}

export async function uploadLocalFiles(
  localPaths: string[]
): Promise<string[]> {
  const urls: string[] = [];
  for (const path of localPaths) {
    urls.push(await uploadLocalFile(path));
  }
  return urls;
}

/**
 * Extract a Cloudinary public_id from a secure URL, e.g.
 * https://res.cloudinary.com/<cloud>/image/upload/v123/gadget-bidding/gadgets/abc.jpg
 * -> gadget-bidding/gadgets/abc
 */
function publicIdFromUrl(url: string): string | null {
  const match = url.match(/\/image\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  return match[1].replace(/\.[a-z0-9]+$/i, '');
}

/**
 * Best-effort deletion of Cloudinary assets referenced by the given URLs.
 * No-op when Cloudinary is not configured.
 */
export async function deleteAssetsByUrl(urls: string[]): Promise<void> {
  if (!isCloudinaryEnabled()) return;
  ensureConfigured();

  for (const url of urls) {
    const publicId = publicIdFromUrl(url);
    if (!publicId) continue;
    try {
      await cloudinary.uploader.destroy(publicId);
      logger.info(`Cloudinary deleted: ${publicId}`);
    } catch (error) {
      logger.error(`Cloudinary delete failed for ${publicId}:`, error);
    }
  }
}
