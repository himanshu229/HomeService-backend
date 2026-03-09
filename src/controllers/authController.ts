import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/authMiddleware';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

// Generate a 6-digit OTP
const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;
    const exists = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: exists.email === email ? 'Email already registered' : 'Phone already registered',
      });
    }
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { name, email, phone, password: hashed },
      select: { id: true, name: true, email: true, phone: true, isVerified: true, role: true },
    });
    // Create OTP for verification
    const code = genOtp();
    console.log(`\n  Registering user: ${email} / ${code}`);
    await prisma.oTP.create({
      data: {
        code,
        type: 'signup',
        userId: user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    console.log(`  📱 OTP for ${email}: ${code}`);
    const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
    return res.status(201).json({ success: true, data: { user, accessToken, refreshToken } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
    const { password: _, refreshToken: __, ...userData } = user;
    return res.json({ success: true, data: { user: userData, accessToken, refreshToken } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Also handle dev shortcut for verifyOtp in sendOtp flow
    if (code === '123456') {
      const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
      const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
      await prisma.user.update({ where: { id: user.id }, data: { isVerified: true, refreshToken } });
      const { password: _, refreshToken: __, ...userData } = user;
      return res.json({ success: true, data: { user: { ...userData, isVerified: true }, accessToken, refreshToken } });
    }

    const otp = await prisma.oTP.findFirst({
      where: { userId: user.id, code, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }
    await prisma.oTP.update({ where: { id: otp.id }, data: { used: true } });
    await prisma.user.update({ where: { id: user.id }, data: { isVerified: true } });
    const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
    const { password: _, refreshToken: __, ...userData } = user;
    return res.json({ success: true, data: { user: { ...userData, isVerified: true }, accessToken, refreshToken } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const code = genOtp();
    await prisma.oTP.create({
      data: { code, type: 'login', userId: user.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    console.log('\n' + '='.repeat(50));
    console.log(`  📱 OTP for ${email}: ${code}`);
    console.log('='.repeat(50) + '\n');
    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal if user exists
      return res.json({ success: true, message: 'If this email is registered, a reset link was sent.' });
    }
    const code = genOtp();
    await prisma.oTP.create({
      data: { code, type: 'forgot_password', userId: user.id, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
    });
    console.log('\n' + '='.repeat(50));
    console.log(`  🔑 Password Reset OTP for ${email}: ${code}`);
    console.log('='.repeat(50) + '\n');
    return res.json({ success: true, message: 'If this email is registered, a reset link was sent.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const otp = await prisma.oTP.findFirst({
      where: { userId: user.id, code, type: 'forgot_password', used: false, expiresAt: { gt: new Date() } },
    });
    if (!otp) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    await prisma.oTP.update({ where: { id: otp.id }, data: { used: true } });
    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return res.status(401).json({ success: false, message: 'Refresh token required' });
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
    const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
    const newRefreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role as 'USER' | 'ADMIN' });
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefreshToken } });
    return res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true, isVerified: true, createdAt: true,
        addresses: true,
      },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, data: { user } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone } = req.body;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { name, phone },
      select: { id: true, name: true, email: true, phone: true, isVerified: true },
    });
    return res.json({ success: true, data: { user } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.update({ where: { id: req.userId }, data: { refreshToken: null } });
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Admin-specific endpoints ─────────────────────────────────────────────────

/**
 * POST /api/admin/auth/login
 * Same credentials flow as normal login but only allows ADMIN role.
 */
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    // Block non-admin users from accessing the admin portal
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Admin access only' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const accessToken  = generateAccessToken({ userId: user.id, email: user.email, role: 'ADMIN' });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: 'ADMIN' });
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
    const { password: _, refreshToken: __, ...userData } = user;
    return res.json({ success: true, data: { user: userData, accessToken, refreshToken } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/admin/auth/me
 * Returns the currently authenticated admin's profile.
 */
export const adminGetMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, phone: true, role: true, isVerified: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, data: user });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
