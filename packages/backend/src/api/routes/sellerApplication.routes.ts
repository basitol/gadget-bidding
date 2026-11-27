import os from 'os';
import path from 'path';
import multer from 'multer';
import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { uploadRateLimiter } from '../middlewares/security.middleware';
import { sendError, sendSuccess } from '../../utils/response';
import * as applications from '../../services/seller/sellerApplication.service';
import { getPublicUser } from '../../services/auth/auth.service';

/** The seller's own application, mounted at /api/v1/seller/application. */
const router: Router = Router();
router.use(authenticate, sellerOnly);

export const DOCUMENT_MAX_MB = 10;
const DOCUMENT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

const uploadDocument = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `seller-doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || '.jpg'}`);
    },
  }),
  limits: { fileSize: DOCUMENT_MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (DOCUMENT_TYPES.includes((file.mimetype || '').toLowerCase())) return cb(null, true);
    cb(new Error('Upload a photo (JPEG, PNG or HEIC) or a PDF.'));
  },
}).single('file');

const run =
  (fn: (req: Request) => Promise<unknown>, message?: string) =>
  async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await fn(req), message);
    } catch (error: any) {
      sendError(res, error.message || 'That didn’t work. Try again.', 400);
    }
  };

router.get('/', run(req => applications.getMyApplication(req.user!.user_id)));
/** The seller's account, fresh (verification status changes while the app is closed). */
router.get('/account', run(req => getPublicUser(req.user!.user_id)));

router.put(
  '/',
  [
    body('business_name').optional({ nullable: true }).isString().isLength({ max: 255 }),
    body('owner_name').optional({ nullable: true }).isString().isLength({ max: 255 }),
    body('plaza').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('shop_number').optional({ nullable: true }).isString().isLength({ max: 60 }),
    body('business_phone').optional({ nullable: true }).isString().isLength({ max: 20 }),
    body('categories').optional().isArray({ max: 6 }),
    body('registration_type').optional().isIn(['rc', 'bn', 'RC', 'BN']),
    body('registration_number').optional({ nullable: true }).isString().isLength({ max: 20 }),
  ],
  handleValidationErrors,
  run(req => applications.updateMyApplication(req.user!.user_id, req.body))
);

router.post(
  '/documents/:kind',
  uploadRateLimiter,
  [param('kind').isIn([...applications.DOCUMENT_KINDS])],
  handleValidationErrors,
  (req: Request, res: Response, next: NextFunction) =>
    uploadDocument(req, res, err => {
      if (!err) return next();
      const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
      sendError(res, tooBig ? `Files can be up to ${DOCUMENT_MAX_MB} MB.` : err.message || 'Upload failed', 400);
    }),
  run(async req => {
    if (!req.file) throw new Error('Choose a photo or PDF to upload.');
    return applications.uploadMyDocument(req.user!.user_id, req.params.kind as applications.DocumentKind, req.file);
  }, 'Uploaded')
);

router.post(
  '/submit',
  [body('rules').isArray({ min: 1, max: 10 })],
  handleValidationErrors,
  run(req => applications.submitMyApplication(req.user!.user_id, req.body.rules), 'Application sent')
);

router.post('/resubmit', run(req => applications.resubmitMyApplication(req.user!.user_id), 'Sent for review'));
router.post('/second-review', run(req => applications.requestSecondReview(req.user!.user_id), 'Second review asked for'));
router.post('/reapply', run(req => applications.reapplyMyApplication(req.user!.user_id), 'Application reopened'));
router.post('/seen', run(req => applications.markApprovalSeen(req.user!.user_id)));

export default router;
