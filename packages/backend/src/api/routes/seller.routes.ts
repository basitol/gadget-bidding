import { Router } from 'express';
import { body } from 'express-validator';
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
