import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';

// ─── COD enforcement ──────────────────────────────────────────────────────────
// Set DISABLE_ONLINE_PAYMENTS=false in .env to allow other methods (test only).
const DISABLE_ONLINE_PAYMENTS = process.env.DISABLE_ONLINE_PAYMENTS !== 'false';

// ─── Status transition guard ──────────────────────────────────────────────────
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING:             ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:           ['TECHNICIAN_ASSIGNED', 'CANCELLED'],
  TECHNICIAN_ASSIGNED: ['ON_THE_WAY', 'CANCELLED'],
  ON_THE_WAY:          ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS:         ['COMPLETED'],
  COMPLETED:           [],
  CANCELLED:           [],
};

export function assertTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

// ─── Status history helper ────────────────────────────────────────────────────
export async function recordStatusHistory(
  bookingId: string,
  fromStatus: string | null,
  toStatus: string,
  changedByUserId: string,
  changedByRole: string,
  reason?: string,
) {
  await prisma.bookingStatusHistory.create({
    data: {
      bookingId,
      fromStatus: fromStatus as any,
      toStatus:   toStatus as any,
      changedByUserId,
      changedByRole,
      reason: reason || null,
    },
  });
}

export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId, addressId, scheduledDate, notes } = req.body;
    // Accept both "scheduledSlot" and "timeSlot" (mobile sent the wrong key previously)
    const scheduledSlot: string = req.body.scheduledSlot ?? req.body.timeSlot;

    // COD guard — reject any attempt to pass a non-CASH payment method
    if (DISABLE_ONLINE_PAYMENTS) {
      const requested = (req.body.paymentMethod as string | undefined)?.toUpperCase();
      if (requested && requested !== 'CASH') {
        return res.status(403).json({
          success: false,
          message: 'Only Cash on Delivery (COD) is accepted. Online payments are disabled.',
        });
      }
    }

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    if (!service.isActive) return res.status(400).json({ success: false, message: 'Service is not available' });
    // Find an available technician
    const technician = await prisma.technician.findFirst({
      where: {
        isAvailable: true,
        services: { some: { serviceId } },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void technician; // kept for reference; admin now assigns technicians manually
    const booking = await prisma.booking.create({
      data: {
        userId:        req.userId!,
        serviceId,
        addressId:     addressId || null,
        technicianId:  null,       // admin assigns manually
        scheduledDate: new Date(scheduledDate),
        scheduledSlot,
        paymentMethod: 'CASH',     // always COD, regardless of request body
        paymentStatus: 'PENDING',
        notes:         notes || null,
        totalAmount: service.price,
        status: 'PENDING',
      },
      include: {
        service: { include: { category: true } },
        address: true,
        technician: true,
      },
    });

    await recordStatusHistory(booking.id, null, 'PENDING', req.userId!, 'USER', 'Booking created');

    return res.status(201).json({ success: true, data: booking });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getUserBookings = async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.userId },
      include: {
        service: { include: { category: true } },
        address: true,
        technician: true,
        review: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map to flat shape expected by the mobile BookingCard
    const data = bookings.map(b => ({
      ...b,
      serviceName:     b.service?.name                 ?? '',
      serviceCategory: (b.service as any)?.category?.name ?? '',
    }));

    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getBookingById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const booking = await prisma.booking.findFirst({
      where: { id, userId: req.userId },
      include: {
        service: { include: { category: true } },
        address: true,
        technician: true,
        review: true,
      },
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return res.json({ success: true, data: booking });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const booking = await prisma.booking.findFirst({ where: { id, userId: req.userId } });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!assertTransition(booking.status, 'CANCELLED')) {
      return res.status(409).json({
        success: false,
        message: `Cannot cancel a booking in status ${booking.status}`,
      });
    }
    const updated = await prisma.booking.update({
      where: { id },
      data:  { status: 'CANCELLED' },
      include: { service: true, address: true, technician: true },
    });
    await recordStatusHistory(id, booking.status, 'CANCELLED', req.userId!, 'USER', 'Cancelled by customer');
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    const existing = await prisma.booking.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!assertTransition(existing.status, status)) {
      return res.status(409).json({
        success: false,
        message: `Transition from ${existing.status} to ${status} is not allowed`,
      });
    }
    const booking = await prisma.booking.update({
      where: { id },
      data: {
        status:      status as any,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
      include: { service: true, address: true, technician: true },
    });
    await recordStatusHistory(id, existing.status, status, req.userId!, req.userRole ?? 'USER');
    return res.json({ success: true, data: booking });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createReview = async (req: AuthRequest, res: Response) => {
  try {
    const { bookingId, rating, comment, tags } = req.body;
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId: req.userId, status: 'COMPLETED' },
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found or not completed' });
    if (!booking.technicianId) return res.status(400).json({ success: false, message: 'No technician assigned' });

    const existing = await prisma.review.findUnique({ where: { bookingId } });
    if (existing) return res.status(409).json({ success: false, message: 'Review already submitted' });

    const review = await prisma.review.create({
      data: {
        bookingId,
        userId: req.userId!,
        technicianId: booking.technicianId,
        rating,
        comment: comment || null,
        tags: tags || [],
      },
    });

    // Update technician rating average
    const reviews = await prisma.review.findMany({ where: { technicianId: booking.technicianId } });
    const avg = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
    await prisma.technician.update({
      where: { id: booking.technicianId },
      data: { rating: parseFloat(avg.toFixed(1)), reviewCount: reviews.length },
    });

    return res.status(201).json({ success: true, data: { review } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// ADMIN — booking management handlers
// ═══════════════════════════════════════════════════════════════

// ─── DTO adapter: DB row → flat shape the admin frontend expects ──────────────
function toAdminBookingDto(b: any) {
  return {
    id:             b.id,
    customerId:     b.userId,
    customerName:   b.user ? `${b.user.firstName} ${b.user.lastName}` : '',
    customerPhone:  b.user?.phone ?? '',
    serviceId:      b.serviceId,
    serviceName:    b.service?.name ?? '',
    technicianId:   b.technicianId ?? null,
    technicianName: b.technician ? b.technician.name : null,
    address:        b.address
      ? [b.address.street, b.address.city, b.address.pincode].filter(Boolean).join(', ')
      : '',
    scheduledDate: b.scheduledDate,
    scheduledTime: b.scheduledSlot,
    status:        (b.status as string).toLowerCase() as any,
    totalAmount:   b.totalAmount,
    paymentMethod: b.paymentMethod,
    paymentStatus: b.paymentStatus,
    notes:         b.notes ?? '',
    createdAt:     b.createdAt,
    updatedAt:     b.updatedAt,
  };
}

const ADMIN_BOOKING_INCLUDE = {
  user:       { select: { id: true, firstName: true, lastName: true, phone: true } },
  service:    { select: { id: true, name: true } },
  address:    { select: { street: true, city: true, pincode: true } },
  technician: { select: { id: true, name: true } },
} as const;

// ─── GET /api/admin/bookings ──────────────────────────────────────────────────
export const adminGetBookings = async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '10', status, search, from, to } =
      req.query as Record<string, string | undefined>;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip     = (pageNum - 1) * limitNum;
    const where: any = {};

    if (status && status !== 'all') where.status = status.toUpperCase();
    if (from || to) {
      where.scheduledDate = {};
      if (from) where.scheduledDate.gte = new Date(from);
      if (to)   where.scheduledDate.lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { user:    { firstName: { contains: search, mode: 'insensitive' } } },
        { user:    { lastName:  { contains: search, mode: 'insensitive' } } },
        { user:    { phone:     { contains: search, mode: 'insensitive' } } },
        { service: { name:      { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({ where, include: ADMIN_BOOKING_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take: limitNum }),
      prisma.booking.count({ where }),
    ]);

    return res.json({ success: true, data: bookings.map(toAdminBookingDto), total, page: pageNum, limit: limitNum });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/bookings/stats ────────────────────────────────────────────
export const adminGetBookingStats = async (_req: AuthRequest, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, pending, confirmed, technicianAssigned, inProgress, completed, cancelled, todayRevenue] =
      await Promise.all([
        prisma.booking.count(),
        prisma.booking.count({ where: { status: 'PENDING' } }),
        prisma.booking.count({ where: { status: 'CONFIRMED' } }),
        prisma.booking.count({ where: { status: 'TECHNICIAN_ASSIGNED' } }),
        prisma.booking.count({ where: { status: 'IN_PROGRESS' } }),
        prisma.booking.count({ where: { status: 'COMPLETED' } }),
        prisma.booking.count({ where: { status: 'CANCELLED' } }),
        prisma.booking.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: todayStart } }, _sum: { totalAmount: true } }),
      ]);

    return res.json({ success: true, data: { total, pending, confirmed, technicianAssigned, inProgress, completed, cancelled, todayRevenue: todayRevenue._sum.totalAmount ?? 0 } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/bookings/:id ──────────────────────────────────────────────
export const adminGetBookingById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { ...ADMIN_BOOKING_INCLUDE, statusHistory: { orderBy: { createdAt: 'asc' } }, review: true },
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return res.json({ success: true, data: toAdminBookingDto(booking) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/admin/bookings/:id/status ────────────────────────────────────
export const adminUpdateBookingStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { status, reason } = req.body as { status: string; reason?: string };

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const nextStatus = status.toUpperCase();
    if (!assertTransition(booking.status, nextStatus)) {
      return res.status(409).json({ success: false, message: `Transition from ${booking.status} to ${nextStatus} is not allowed` });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data:  { status: nextStatus as any, completedAt: nextStatus === 'COMPLETED' ? new Date() : undefined },
      include: ADMIN_BOOKING_INCLUDE,
    });
    await recordStatusHistory(id, booking.status, nextStatus, req.userId!, 'ADMIN', reason);
    return res.json({ success: true, data: toAdminBookingDto(updated) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/admin/bookings/:id/assign ────────────────────────────────────
export const adminAssignTechnician = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { technicianId } = req.body as { technicianId: string | null };

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
      return res.status(409).json({ success: false, message: `Cannot modify a ${booking.status} booking` });
    }

    // ── Unassign ─────────────────────────────────────────────────────────────
    if (!technicianId) {
      // Revert status to CONFIRMED if it was only TECHNICIAN_ASSIGNED
      const revertStatus = booking.status === 'TECHNICIAN_ASSIGNED' ? 'CONFIRMED' : booking.status;
      const updated = await prisma.booking.update({
        where: { id },
        data:  { technicianId: null, status: revertStatus as any },
        include: ADMIN_BOOKING_INCLUDE,
      });
      if (revertStatus !== booking.status) {
        await recordStatusHistory(id, booking.status, revertStatus, req.userId!, 'ADMIN', 'Technician unassigned');
      }
      return res.json({ success: true, data: toAdminBookingDto(updated) });
    }

    // ── Assign ───────────────────────────────────────────────────────────────
    const technician = await prisma.technician.findUnique({ where: { id: technicianId } });
    if (!technician) return res.status(404).json({ success: false, message: 'Technician not found' });

    const nextStatus = ['PENDING', 'CONFIRMED'].includes(booking.status) ? 'TECHNICIAN_ASSIGNED' : booking.status;
    const updated = await prisma.booking.update({
      where: { id },
      data:  { technicianId, status: nextStatus as any },
      include: ADMIN_BOOKING_INCLUDE,
    });

    if (nextStatus !== booking.status) {
      await recordStatusHistory(id, booking.status, nextStatus, req.userId!, 'ADMIN', `Technician ${technician.name} assigned`);
    }
    return res.json({ success: true, data: toAdminBookingDto(updated) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/admin/bookings/:id/cancel ────────────────────────────────────
export const adminCancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!assertTransition(booking.status, 'CANCELLED')) {
      return res.status(409).json({ success: false, message: `Cannot cancel a booking in status ${booking.status}` });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data:  { status: 'CANCELLED' },
      include: ADMIN_BOOKING_INCLUDE,
    });
    await recordStatusHistory(id, booking.status, 'CANCELLED', req.userId!, 'ADMIN', reason || 'Cancelled by admin');
    return res.json({ success: true, data: toAdminBookingDto(updated) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
