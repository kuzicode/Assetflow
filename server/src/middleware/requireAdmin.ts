import type { NextFunction, Request, Response } from 'express';
import { isValidAdminToken } from '../auth/session.js';

function extractBearerToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const headerToken = req.headers['x-admin-token'];
  return typeof headerToken === 'string' ? headerToken : null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!isValidAdminToken(token)) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  next();
}

export function getAdminTokenFromRequest(req: Request) {
  return extractBearerToken(req);
}
