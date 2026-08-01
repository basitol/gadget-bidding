import { Request, Response } from 'express';
import * as addressService from '../../services/address/address.service';
import { sendSuccess } from '../../utils/response';
import logger from '../../utils/logger';
import { sendError } from '../../utils/response';

export const listAddresses = async (req: Request, res: Response) => {
  try {
    const addresses = await addressService.listAddresses(req.user!.user_id);
    sendSuccess(res, addresses);
  } catch (error: any) {
    logger.error('List addresses error:', error);
    sendError(res, error.message || 'Failed to load addresses', 400);
  }
};

export const createAddress = async (req: Request, res: Response) => {
  try {
    const address = await addressService.createAddress(
      req.user!.user_id,
      req.body
    );
    sendSuccess(res, address, 'Address saved', 201);
  } catch (error: any) {
    logger.error('Create address error:', error);
    sendError(res, error.message || 'Failed to save address', 400);
  }
};

export const updateAddress = async (req: Request, res: Response) => {
  try {
    const address = await addressService.updateAddress(
      req.user!.user_id,
      req.params.addressId,
      req.body
    );
    sendSuccess(res, address, 'Address updated');
  } catch (error: any) {
    logger.error('Update address error:', error);
    sendError(res, error.message || 'Failed to update address', 400);
  }
};

export const deleteAddress = async (req: Request, res: Response) => {
  try {
    await addressService.deleteAddress(req.user!.user_id, req.params.addressId);
    sendSuccess(res, { deleted: true }, 'Address deleted');
  } catch (error: any) {
    logger.error('Delete address error:', error);
    sendError(res, error.message || 'Failed to delete address', 400);
  }
};

export const setDefaultAddress = async (req: Request, res: Response) => {
  try {
    const address = await addressService.setDefaultAddress(
      req.user!.user_id,
      req.params.addressId
    );
    sendSuccess(res, address, 'Default address updated');
  } catch (error: any) {
    logger.error('Set default address error:', error);
    sendError(res, error.message || 'Failed to set default address', 400);
  }
};
