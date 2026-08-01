import { body, param } from 'express-validator';

const normalizeNgPhone = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+234${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
};

export const validateAddressId = [
  param('addressId')
    .notEmpty()
    .withMessage('Address ID is required')
    .isUUID()
    .withMessage('Invalid address ID'),
];

export const validateAddress = [
  body('label')
    .optional({ values: 'falsy' })
    .isLength({ max: 80 })
    .withMessage('Address label must be less than 80 characters'),
  body('full_name')
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('phone_number')
    .notEmpty()
    .withMessage('Phone number is required')
    .customSanitizer(normalizeNgPhone)
    .matches(/^\+234[0-9]{10}$/)
    .withMessage(
      'Phone number must be a valid Nigerian number (e.g. 08012345678)'
    ),
  body('address_line1')
    .notEmpty()
    .withMessage('Address line 1 is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  body('address_line2')
    .optional({ values: 'falsy' })
    .isLength({ max: 200 })
    .withMessage('Address line 2 must be less than 200 characters'),
  body('city')
    .notEmpty()
    .withMessage('City is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  body('state')
    .notEmpty()
    .withMessage('State is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  body('postal_code')
    .optional({ values: 'falsy' })
    .isLength({ max: 20 })
    .withMessage('Postal code must be less than 20 characters'),
  body('country')
    .optional({ values: 'falsy' })
    .default('Nigeria')
    .isLength({ max: 100 })
    .withMessage('Country must be less than 100 characters'),
  body('is_default').optional().isBoolean().toBoolean(),
];
