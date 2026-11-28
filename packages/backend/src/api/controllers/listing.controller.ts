/**
 * The seller's "List a gadget" flow: config, model search, IMEI / serial check and price hint.
 * Create / update with the listing-flow body go through gadget.controller (createGadget / updateGadget).
 */
import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import * as listingService from '../../services/gadget/listing.service';
import { isCategoryKey, searchModels } from '../../services/gadget/deviceModels.service';

export const sendListingError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof listingService.ListingInputError) return sendError(res, error.message, error.status);
  logger.error(`${fallback}:`, error);
  return sendError(res, fallback, 500);
};

/** GET /api/v1/gadgets/listing-config */
export const getListingConfig = (_req: Request, res: Response) => {
  sendSuccess(res, listingService.listingConfig());
};

/** GET /api/v1/gadgets/models?q=&category= */
export const getModels = async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const category = req.query.category;
    if (category !== undefined && category !== '' && !isCategoryKey(category)) {
      return sendError(res, 'Pick a category from the list.', 400);
    }
    const items = await searchModels(q, (category || undefined) as any);
    sendSuccess(res, { items });
  } catch (error) {
    sendListingError(res, error, 'Couldn’t search the models. Try again.');
  }
};

/** POST /api/v1/gadgets/device-check { profile, identifier, gadget_id? } */
export const deviceCheck = async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await listingService.deviceCheck(req.user!.user_id, req.body ?? {}));
  } catch (error) {
    sendListingError(res, error, 'Couldn’t check that number. Try again.');
  }
};

/** GET /api/v1/gadgets/price-hint?profile=&model=&storage= */
export const getPriceHint = async (req: Request, res: Response) => {
  try {
    sendSuccess(res, await listingService.priceHint(req.query));
  } catch (error) {
    sendListingError(res, error, 'Couldn’t load similar sales. Try again.');
  }
};
