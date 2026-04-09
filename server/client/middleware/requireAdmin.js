import { isValidAdminToken } from '../auth/session.js';
function extractBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim();
    }
    const headerToken = req.headers['x-admin-token'];
    return typeof headerToken === 'string' ? headerToken : null;
}
export function requireAdmin(req, res, next) {
    const token = extractBearerToken(req);
    if (!isValidAdminToken(token)) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    next();
}
export function getAdminTokenFromRequest(req) {
    return extractBearerToken(req);
}
