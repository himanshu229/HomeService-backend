import { Request, Response } from 'express';
import prisma from '../utils/prisma';

const USER_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

const toUserListItem = (user: {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  _count: { bookings: number };
}) => ({
  id:            user.id,
  name:          `${user.firstName} ${user.lastName}`.trim(),
  phone:         user.phone,
  email:         user.email ?? '',
  isVerified:    user.isVerified,
  isActive:      user.isActive,
  totalBookings: user._count.bookings,
  createdAt:     user.createdAt,
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
export const adminGetUsers = async (req: Request, res: Response) => {
  try {
    const {
      page   = '1',
      limit  = '10',
      search,
    } = req.query as Record<string, string | undefined>;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip     = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { phone:     { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id:         true,
          phone:      true,
          firstName:  true,
          lastName:   true,
          email:      true,
          isVerified: true,
          isActive:   true,
          createdAt:  true,
          _count:     { select: { bookings: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    const data = users.map(toUserListItem);

    return res.json({ success: true, data, total, page: pageNum, limit: limitNum });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/admin/users ───────────────────────────────────────────────────
export const adminCreateUser = async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      email,
      gender,
      dob,
    } = req.body as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      gender?: string;
      dob?: string;
    };

    const normalizedFirstName = firstName?.trim();
    const normalizedLastName = lastName?.trim();
    const normalizedPhone = phone?.replace(/\D/g, '');
    const normalizedEmail = email?.trim().toLowerCase() || null;
    const normalizedGender = gender?.trim().toUpperCase();

    if (!normalizedFirstName) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }

    if (!normalizedLastName) {
      return res.status(400).json({ success: false, message: 'Last name is required' });
    }

    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit Indian mobile number' });
    }

    if (!normalizedGender || !USER_GENDERS.includes(normalizedGender as typeof USER_GENDERS[number])) {
      return res.status(400).json({ success: false, message: 'Invalid gender value' });
    }

    if (!dob) {
      return res.status(400).json({ success: false, message: 'Date of birth is required' });
    }

    const dobDate = new Date(dob);
    if (Number.isNaN(dobDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date of birth' });
    }

    if (normalizedEmail && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    const existingPhoneUser = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existingPhoneUser) {
      return res.status(409).json({ success: false, message: 'Phone number already registered' });
    }

    if (normalizedEmail) {
      const existingEmailUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existingEmailUser) {
        return res.status(409).json({ success: false, message: 'Email is already in use' });
      }
    }

    const user = await prisma.user.create({
      data: {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        phone: normalizedPhone,
        email: normalizedEmail,
        gender: normalizedGender as typeof USER_GENDERS[number],
        dob: dobDate,
        isVerified: true,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
    });

    return res.status(201).json({ success: true, data: toUserListItem(user) });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Phone or email already registered' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/users/:id ─────────────────────────────────────────────────
export const adminGetUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({
      where:  { id },
      select: {
        id:         true,
        phone:      true,
        firstName:  true,
        lastName:   true,
        email:      true,
        gender:     true,
        dob:        true,
        isVerified: true,
        isActive:   true,
        createdAt:  true,
        addresses:  true,
        bookings: {
          include: { service: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take:    20,
        },
        _count: { select: { bookings: true } },
      },
    });

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({ success: true, data: user });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
