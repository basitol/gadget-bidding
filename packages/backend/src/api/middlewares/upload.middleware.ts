import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, RequestHandler } from 'express';
import config from '../../config';

const uploadsDir = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
      ? ext
      : '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const EXTRA_ALLOWED_MIME_TYPES = [
  'image/jpg', // common alias
  'image/heic', // iOS Photos
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
];

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  if (
    config.allowedImageTypes.includes(mime) ||
    EXTRA_ALLOWED_MIME_TYPES.includes(mime)
  ) {
    cb(null, true);
    return;
  }
  cb(new Error('Only JPEG, PNG, WebP, and HEIC images are allowed'));
};

export const uploadGadgetImages: RequestHandler = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSizeMB * 1024 * 1024,
  },
}).array('images', config.maxImagesPerGadget);

export const buildUploadPath = (filename: string): string =>
  `/uploads/${filename}`;

/** @deprecated Prefer buildUploadPath — clients resolve the host dynamically */
export const buildPublicUploadUrl = (req: Request, filename: string): string => {
  return buildUploadPath(filename);
};
