import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import prisma from '../utils/prisma';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: 'USER' | 'ADMIN';
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }
    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    // Verify the entity still exists in DB (look in correct table based on role)
    if (payload.role === 'ADMIN') {
      const admin = await prisma.admin.findUnique({ where: { id: payload.userId }, select: { id: true } });
      if (!admin) return res.status(401).json({ success: false, message: 'Account not found' });
    } else {
      const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
      if (!user) return res.status(401).json({ success: false, message: 'Account not found' });
    }
    req.userId   = payload.userId;
    req.userRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

/**
 * Middleware: allow only ADMIN role.
 * Must be used AFTER authenticate.
 */
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.userRole !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

/**
 * Middleware factory: allow specific roles.
 * Usage: requireRole('ADMIN', 'USER')
 */
export const requireRole = (...roles: Array<'USER' | 'ADMIN'>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
