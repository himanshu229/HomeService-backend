import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  sendOtp, verifyOtp, completeProfile,
  refreshToken, getProfile, updateProfile, logout,
  adminLogin, adminGetMe,
} from '../controllers/authController';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Allow max 5 OTP sends per phone per 10 minutes
const otpRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.phone || 'unknown',
  message: { success: false, message: 'Too many OTP requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── User OTP auth ────────────────────────────────────────────────────────────
router.post('/send-otp', otpRateLimit, sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/complete-profile', completeProfile);
router.post('/refresh-token', refreshToken);
router.post('/refresh', refreshToken);   // alias used by mobile app

// ── Protected user routes ────────────────────────────────────────────────────
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.post('/logout', authenticate, logout);

// ── Admin auth routes ────────────────────────────────────────────────────────
router.post('/admin/login', adminLogin);
router.get('/admin/me', authenticate, requireAdmin, adminGetMe);

export default router;
