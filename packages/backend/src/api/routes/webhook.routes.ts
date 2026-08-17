import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller';

const router: Router = Router();

/**
 * @route   POST /api/v1/webhooks/paystack
 * @desc    Paystack webhook handler
 * @access  Public (verified by signature)
 */
router.post('/paystack', webhookController.paystackWebhook);

/**
 * @route   POST /api/v1/webhooks/monnify
 * @desc    Monnify webhook handler
 * @access  Public (verified by signature)
 */
router.post('/monnify', webhookController.monnifyWebhook);

export default router;
