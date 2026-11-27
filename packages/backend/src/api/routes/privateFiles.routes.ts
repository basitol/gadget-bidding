import { Router } from 'express';
import { resolveLocalPrivateFile } from '../../services/seller/privateFiles.service';

/** Short-lived signed links to private files kept on this server (when Cloudinary isn't set up). */
const router: Router = Router();

router.get('/:name', (req, res) => {
  const file = resolveLocalPrivateFile(String(req.params.name), String(req.query.exp ?? ''), String(req.query.sig ?? ''));
  if (!file) return res.status(404).json({ success: false, error: 'This link has expired' });
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(file);
});

export default router;
