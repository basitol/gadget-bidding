import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../utils/jwt';
import { sendError } from '../../utils/response';

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
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'No authentication token provided', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyAccessToken(token);

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

  if (req.user.role !== 'seller' && req.user.role !== 'admin') {
    return sendError(
      res,
      'Only sellers can perform this action. Please upgrade to a seller account.',
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
