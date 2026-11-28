import { Router } from 'express';
import { body, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import * as sellerController from '../controllers/seller.controller';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authRateLimiter } from '../middlewares/security.middleware';

const router: Router = Router();

router.get('/dashboard', authenticate, sellerOnly, sellerController.getDashboard);

router.get('/kyb', authenticate, sellerOnly, sellerController.getKybStatus);
// Applying to sell (details, number, documents, rules) lives at /seller/application.

/** Where seller withdrawals go. Changing it needs the password (rate limited like sign-in). */
router.get('/payout-account', authenticate, sellerOnly, sellerController.getPayoutAccount);

/** Looking a number up with the bank before saving. Each look-up is a call to the bank. */
const accountCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many account checks. Wait a few minutes and try again.' },
});
router.get(
  '/payout-account/check',
  accountCheckLimiter,
  authenticate,
  sellerOnly,
  [
    query('bank_code').isString().trim().notEmpty().withMessage('Pick your bank.'),
    query('account_number')
      .isString()
      .trim()
      .matches(/^\d{10}$/)
      .withMessage('Account numbers are 10 digits.'),
  ],
  handleValidationErrors,
  sellerController.checkPayoutAccount
);
router.put(
  '/payout-account',
  authRateLimiter,
  authenticate,
  sellerOnly,
  [
    body('bank_code').isString().trim().notEmpty().withMessage('Pick your bank.'),
    body('account_number')
      .isString()
      .trim()
      .matches(/^\d{10}$/)
      .withMessage('Account numbers are 10 digits.'),
    body('password').isString().notEmpty().withMessage('Enter your password to confirm.'),
  ],
  handleValidationErrors,
  sellerController.setPayoutAccount
);

export default router;
