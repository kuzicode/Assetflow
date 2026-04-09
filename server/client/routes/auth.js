import { Router } from 'express';
import { clearAdminSession, createAdminSession } from '../auth/session.js';
const router = Router();
// POST /api/auth/login
router.post('/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin';
    if (password === adminPassword) {
        const session = createAdminSession();
        res.json({
            success: true,
            authMode: 'admin',
            token: session.token,
            expiresAt: new Date(session.expiresAt).toISOString(),
        });
    }
    else {
        res.status(401).json({ success: false, error: '密码错误' });
    }
});
router.post('/logout', (_req, res) => {
    clearAdminSession();
    res.json({ success: true });
});
export default router;
