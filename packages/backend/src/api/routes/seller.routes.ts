import { Router } from 'express';
import { authenticate, sellerOnly } from '../middlewares/auth.middleware';
import * as sellerController from '../controllers/seller.controller';

const router: Router = Router();

router.get('/dashboard', authenticate, sellerOnly, sellerController.getDashboard);

export default router;
