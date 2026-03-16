import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';

export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId, addressId, scheduledDate, scheduledSlot, paymentMethod, notes } = req.body;

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    // Find an available technician
    const technician = await prisma.technician.findFirst({
      where: {
        isAvailable: true,
        services: { some: { serviceId } },
      },
    });

    const booking = await prisma.booking.create({
      data: {
        userId: req.userId!,
        serviceId,
        addressId: addressId || null,
        technicianId: technician?.id || null,
        scheduledDate: new Date(scheduledDate),
        scheduledSlot,
        paymentMethod,
        notes: notes || null,
        totalAmount: service.price,
        status: 'PENDING',
      },
      include: {
        service: { include: { category: true } },
        address: true,
        technician: true,
      },
    });

    return res.status(201).json({ success: true, data: { booking } });
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
    return res.json({ success: true, data: { bookings } });
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
    return res.json({ success: true, data: { booking } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const booking = await prisma.booking.findFirst({ where: { id, userId: req.userId } });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} booking` });
    }
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { service: true, address: true, technician: true },
    });
    return res.json({ success: true, data: { booking: updated } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body;
    const booking = await prisma.booking.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
      include: { service: true, address: true, technician: true },
    });
    return res.json({ success: true, data: { booking } });
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
