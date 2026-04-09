import crypto from 'crypto';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let activeSession = null;
export function createAdminSession() {
    const token = crypto.randomBytes(32).toString('hex');
    activeSession = {
        token,
        expiresAt: Date.now() + SESSION_TTL_MS,
    };
    return activeSession;
}
export function clearAdminSession() {
    activeSession = null;
}
export function isValidAdminToken(token) {
    if (!token || !activeSession)
        return false;
    if (Date.now() > activeSession.expiresAt) {
        activeSession = null;
        return false;
    }
    return token === activeSession.token;
}
