import { Router } from 'express';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import * as sellerController from '../controllers/seller.controller';
import * as sellerValidator from '../validators/seller.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';

const router: Router = Router();

router.get('/dashboard', authenticate, sellerOnly, sellerController.getDashboard);

router.get('/kyb', authenticate, sellerOnly, sellerController.getKybStatus);
router.post(
  '/kyb',
  authenticate,
  sellerOnly,
  sellerValidator.validateSubmitKyb,
  handleValidationErrors,
  sellerController.submitKyb
);

export default router;
