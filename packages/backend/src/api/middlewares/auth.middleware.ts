import { Request, Response, NextFunction } from 'express';
import { isSellerRole } from '@gadget-bidding/shared';
import { verifyAccessToken } from '../../utils/jwt';
import { sendError } from '../../utils/response';
import prisma from '../../config/prisma';

// Extend Express Request to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        user_id: string;
        phone_number: string;
        role: string;
      };
    }
  }
}

/**
 * Authenticate user via JWT
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  void authenticateUser(req, res, next);
};

const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'No authentication token provided', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.user_id },
      select: { isActive: true },
    });

    if (!user || user.isActive === false) {
      return sendError(
        res,
        'This account is suspended. Please contact support.',
        403
      );
    }

    // Attach user to request
    req.user = decoded;

    next();
  } catch (error: any) {
    return sendError(res, error.message || 'Invalid authentication token', 401);
  }
};

/**
 * Check if user has specific role(s)
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Authentication required', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        'You do not have permission to access this resource',
        403
      );
    }

    next();
  };
};

/**
 * Check if user is a seller (can list gadgets)
 */
export const sellerOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return sendError(res, 'Authentication required', 401);
  }

  if (!isSellerRole(req.user.role)) {
    return sendError(
      res,
      'Only sellers can perform this action. Please upgrade to a seller account.',
      403
    );
  }

  next();
};

/**
 * Require a seller's KYB (business identity) to be admin-approved before
 * they can list a gadget. Submitting KYB details only sets it to "pending"
 * — an admin has to approve it (see admin.controller.ts) before this passes.
 */
export const requireSellerKyb = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  void requireSellerKybCheck(req, res, next);
};

const requireSellerKybCheck = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return sendError(res, 'Authentication required', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.user_id },
    select: { sellerKybStatus: true },
  });

  if (user?.sellerKybStatus !== 'approved') {
    return sendError(
      res,
      user?.sellerKybStatus === 'pending'
        ? 'Your seller verification is still under review.'
        : 'Complete your seller verification before listing a gadget.',
      403
    );
  }

  next();
};

/**
 * Check if user is an admin
 */
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return sendError(res, 'Authentication required', 401);
  }

  if (req.user.role !== 'admin') {
    return sendError(res, 'Admin access required', 403);
  }

  next();
};

/**
 * Optional authentication (attach user if token exists, but don't fail if not)
 */
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyAccessToken(token);
      req.user = decoded;
    }

    next();
  } catch (error) {
    // Continue without user authentication
    next();
  }
};
