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

/** What a store staff session may call: its own app, sign-in/account, push token, app config. */
const STAFF_PATHS = /^\/api\/v\d+\/(staff|auth|app-config|notifications\/push-token)(\/|\?|$)/;

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
      select: { id: true, isActive: true, role: true, email: true, lastActiveAt: true },
    });

    if (!user) {
      return sendError(res, 'This account is suspended. Please contact support.', 403);
    }
    if (user.isActive === false) {
      // A team member paused mid-session: the dashboard signs them out and shows why.
      const { pauseDetailsFor } = await import('../../services/auth/auth.service');
      return res.status(403).json({
        success: false,
        error: user.role === 'admin' ? 'Your admin access is paused.' : 'This account is suspended. Please contact support.',
        code: 'ACCOUNT_PAUSED',
        ...(user.role === 'admin' ? { data: await pauseDetailsFor(user) } : {}),
      });
    }

    // "Last active" for the team: written at most every 5 minutes, never waited on.
    if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 5 * 60_000) {
      prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
    }

    // Store staff accounts only work in the staff app: no bidding, buying or seller tools.
    if (decoded.role === 'staff' && !STAFF_PATHS.test(req.originalUrl)) {
      return sendError(res, 'Store staff accounts can only use the staff app.', 403);
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

  // Every rule for sending a new listing lives in one place.
  const { whyCantList } = await import('../../services/seller/listingGate.service');
  const block = await whyCantList(req.user.user_id);
  if (block) {
    return res.status(403).json({ success: false, error: block.message, code: block.code });
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
