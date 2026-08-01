import { Router } from 'express';
import * as addressController from '../controllers/address.controller';
import * as addressValidator from '../validators/address.validator';
import { authenticate } from '../middlewares/auth.middleware';
import { handleValidationErrors } from '../middlewares/validation.middleware';

const router: Router = Router();

router.get('/', authenticate, addressController.listAddresses);

router.post(
  '/',
  authenticate,
  addressValidator.validateAddress,
  handleValidationErrors,
  addressController.createAddress
);

router.put(
  '/:addressId',
  authenticate,
  addressValidator.validateAddressId,
  addressValidator.validateAddress,
  handleValidationErrors,
  addressController.updateAddress
);

router.put(
  '/:addressId/default',
  authenticate,
  addressValidator.validateAddressId,
  handleValidationErrors,
  addressController.setDefaultAddress
);

router.delete(
  '/:addressId',
  authenticate,
  addressValidator.validateAddressId,
  handleValidationErrors,
  addressController.deleteAddress
);

export default router;
