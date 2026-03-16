import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/authMiddleware';
import { genOtp, PHONE_RE } from '../utils/common';

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone || !PHONE_RE.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 10-digit Indian mobile number',
      });
    }

    // Invalidate any previous unused OTPs for this phone so only the latest works
    await prisma.oTP.updateMany({
      where: { phone, used: false },
      data: { used: true },
    });

    const code = genOtp();
    await prisma.oTP.create({
      data: {
        code,
        phone,
        type: 'LOGIN',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    // In production: send via SMS gateway here
    console.log('\n' + '='.repeat(50));
    console.log(`  📱 OTP for ${phone}: ${code}`);
    console.log('='.repeat(50) + '\n');

    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required',
      });
    }
    if (!PHONE_RE.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'OTP must be 6 digits' });
    }

    const otpRecord = await prisma.oTP.findFirst({
      where: { phone, code: otp, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Consume the OTP — single use
    await prisma.oTP.update({ where: { id: otpRecord.id }, data: { used: true } });

    // Check whether this phone is already registered
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      // New user — caller must complete their profile next
      return res.json({ success: true, data: { isNewUser: true } });
    }

    // Existing user — generate tokens and log them in
    const accessToken  = generateAccessToken({ userId: user.id, role: 'USER' });
    const refreshToken = generateRefreshToken({ userId: user.id, role: 'USER' });
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken, isVerified: true },
    });

    const { refreshToken: _rt, ...userData } = user;
    return res.json({
      success: true,
      data: { isNewUser: false, accessToken, refreshToken, user: userData },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /auth/complete-profile ─────────────────────────────────────────────
export const completeProfile = async (req: Request, res: Response) => {
  try {
    const { phone, firstName, lastName, gender, dob, email } = req.body;

    if (!phone || !firstName || !lastName || !gender || !dob) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided' });
    }
    if (!PHONE_RE.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }
    if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
      return res.status(400).json({ success: false, message: 'Invalid gender value' });
    }

    // Ensure the OTP for this phone was verified recently (OTP still within validity window)
    const verifiedOtp = await prisma.oTP.findFirst({
      where: { phone, used: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verifiedOtp) {
      return res.status(401).json({
        success: false,
        message: 'OTP verification required before completing profile',
      });
    }

    // Guard against race-condition duplicate registrations
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Phone number already registered' });
    }

    if (email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) {
        return res.status(409).json({ success: false, message: 'Email is already in use' });
      }
    }

    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date of birth' });
    }

    const user = await prisma.user.create({
      data: {
        phone,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        dob: dobDate,
        email: email ? email.trim().toLowerCase() : null,
        isVerified: true,
      },
      select: {
        id: true, phone: true, firstName: true, lastName: true,
        gender: true, dob: true, email: true, isVerified: true, createdAt: true,
      },
    });

    const accessToken  = generateAccessToken({ userId: user.id, role: 'USER' });
    const refreshToken = generateRefreshToken({ userId: user.id, role: 'USER' });
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    return res.status(201).json({ success: true, data: { user, accessToken, refreshToken } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
    const accessToken    = generateAccessToken({ userId: user.id, role: 'USER' });
    const newRefresh     = generateRefreshToken({ userId: user.id, role: 'USER' });
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefresh } });
    return res.json({ success: true, data: { accessToken, refreshToken: newRefresh } });
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

// ─── GET /auth/profile ────────────────────────────────────────────────────────
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, phone: true, firstName: true, lastName: true,
        gender: true, dob: true, email: true, isVerified: true,
        createdAt: true, addresses: true,
      },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, data: { user } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /auth/profile ────────────────────────────────────────────────────────
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, email } = req.body;

    if (email) {
      const emailTaken = await prisma.user.findFirst({
        where: { email, NOT: { id: req.userId } },
      });
      if (emailTaken) {
        return res.status(409).json({ success: false, message: 'Email is already in use' });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(firstName && { firstName: firstName.trim() }),
        ...(lastName  && { lastName:  lastName.trim()  }),
        ...(email     && { email:     email.trim().toLowerCase() }),
      },
      select: {
        id: true, phone: true, firstName: true, lastName: true,
        gender: true, dob: true, email: true, isVerified: true,
      },
    });
    return res.json({ success: true, data: { user } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /auth/logout ────────────────────────────────────────────────────────
export const logout = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.update({ where: { id: req.userId }, data: { refreshToken: null } });
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Admin endpoints ──────────────────────────────────────────────────────────

export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const accessToken  = generateAccessToken({ userId: admin.id, role: 'ADMIN' });
    const refreshToken = generateRefreshToken({ userId: admin.id, role: 'ADMIN' });
    await prisma.admin.update({ where: { id: admin.id }, data: { refreshToken } });
    const { password: _, refreshToken: __, ...adminData } = admin;
    return res.json({ success: true, data: { admin: adminData, accessToken, refreshToken } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminGetMe = async (req: AuthRequest, res: Response) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    return res.json({ success: true, data: admin });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
