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
 * @route   POST /api/v1/webhooks/flutterwave
 * @desc    Flutterwave webhook handler
 * @access  Public (verified by signature)
 */
// router.post('/flutterwave', webhookController.flutterwaveWebhook);

export default router;
