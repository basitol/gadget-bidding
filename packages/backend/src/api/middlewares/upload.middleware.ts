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

/* ---- One short video for a problem report (mp4 / mov, 50 MB, 60 seconds) ---- */

export const CASE_VIDEO_MAX_MB = 50;
export const CASE_VIDEO_MAX_SECONDS = 60;

const VIDEO_EXT_BY_MIME: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-m4v': '.mp4',
};
const VIDEO_EXTS = ['.mp4', '.mov', '.m4v'];

export const uploadCaseVideo: RequestHandler = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = VIDEO_EXT_BY_MIME[(file.mimetype || '').toLowerCase()] || '.mp4';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (VIDEO_EXT_BY_MIME[mime] && (!ext || VIDEO_EXTS.includes(ext))) {
      cb(null, true);
      return;
    }
    cb(new Error('Add an MP4 or MOV video.'));
  },
  limits: { fileSize: CASE_VIDEO_MAX_MB * 1024 * 1024, files: 1 },
}).single('video');

/**
 * Length of an MP4/MOV in seconds, read from the movie header (moov → mvhd).
 * Returns null when the file isn't an MP4/QuickTime container we can read.
 */
export const videoDurationSeconds = (filePath: string): number | null => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const fileSize = fs.fstatSync(fd).size;
    const readAt = (pos: number, len: number) => {
      const buf = Buffer.alloc(len);
      return fs.readSync(fd, buf, 0, len, pos) === len ? buf : null;
    };
    /** Walk the boxes in [start, end) and return the offset/size of the first box of `type`. */
    const find = (type: string, start: number, end: number) => {
      let pos = start;
      while (pos + 8 <= end) {
        const h = readAt(pos, end - pos >= 16 ? 16 : 8);
        if (!h) return null;
        let size = h.readUInt32BE(0);
        const boxType = h.toString('latin1', 4, 8);
        let headerSize = 8;
        if (size === 1) {
          if (end - pos < 16) return null;
          size = Number(h.readBigUInt64BE(8));
          headerSize = 16;
        } else if (size === 0) {
          size = end - pos;
        }
        if (size < headerSize || pos + size > end) return null;
        if (boxType === type) return { body: pos + headerSize, end: pos + size };
        pos += size;
      }
      return null;
    };
    const moov = find('moov', 0, fileSize);
    if (!moov) return null;
    const mvhd = find('mvhd', moov.body, moov.end);
    if (!mvhd) return null;
    const v = readAt(mvhd.body, 1);
    if (!v) return null;
    if (v[0] === 1) {
      const b = readAt(mvhd.body + 20, 12); // version/flags 4 + created 8 + modified 8
      if (!b) return null;
      const timescale = b.readUInt32BE(0);
      return timescale ? Number(b.readBigUInt64BE(4)) / timescale : null;
    }
    const b = readAt(mvhd.body + 12, 8); // version/flags 4 + created 4 + modified 4
    if (!b) return null;
    const timescale = b.readUInt32BE(0);
    return timescale ? b.readUInt32BE(4) / timescale : null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
};

export const buildUploadPath = (filename: string): string =>
  `/uploads/${filename}`;

/** @deprecated Prefer buildUploadPath — clients resolve the host dynamically */
export const buildPublicUploadUrl = (req: Request, filename: string): string => {
  return buildUploadPath(filename);
};
