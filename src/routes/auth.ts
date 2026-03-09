import { Router } from 'express';
import {
  register, login, verifyOtp, sendOtp, forgotPassword, resetPassword,
  refreshToken, getProfile, updateProfile, logout,
  adminLogin, adminGetMe,
} from '../controllers/authController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/signup', register);       // alias used by mobile app
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/send-otp', sendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/refresh-token', refreshToken);
router.post('/refresh', refreshToken);  // alias used by mobile app

// Protected user routes
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.post('/logout', authenticate, logout);

// ── Admin auth routes ────────────────────────────────────────────────────────
// POST /api/auth/admin/login  – Admin portal sign-in (ADMIN role required)
router.post('/admin/login', adminLogin);
// GET  /api/auth/admin/me     – Returns the signed-in admin's profile
router.get('/admin/me', authenticate, requireAdmin, adminGetMe);

export default router;
