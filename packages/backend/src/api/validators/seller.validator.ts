import { body, ValidationChain } from 'express-validator';

export const validateSubmitKyb: ValidationChain[] = [
  body('business_name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Business/shop name must be between 2 and 255 characters'),
  body('cac_number')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('CAC number must be at most 50 characters'),
];
