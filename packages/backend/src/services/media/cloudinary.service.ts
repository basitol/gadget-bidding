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
