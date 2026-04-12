import { Request, Response } from 'express';
import prisma from '../utils/prisma';

// ─── GET /api/admin/dashboard/stats ──────────────────────────────────────────
export const adminGetDashboardStats = async (_req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalBookings,
      pendingBookings,
      activeBookings,
      completedBookings,
      cancelledBookings,
      totalUsers,
      totalTechnicians,
      availableTechnicians,
      todayBookings,
      revenueResult,
      todayRevenueResult,
    ] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({
        where: { status: { in: ['CONFIRMED', 'TECHNICIAN_ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'] } },
      }),
      prisma.booking.count({ where: { status: 'COMPLETED' } }),
      prisma.booking.count({ where: { status: 'CANCELLED' } }),
      prisma.user.count(),
      prisma.technician.count({ where: { isActive: true } }),
      prisma.technician.count({ where: { isAvailable: true, isActive: true } }),
      prisma.booking.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.booking.aggregate({
        where:  { status: 'COMPLETED' },
        _sum:   { totalAmount: true },
      }),
      prisma.booking.aggregate({
        where:  { status: 'COMPLETED', completedAt: { gte: todayStart } },
        _sum:   { totalAmount: true },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        bookings: {
          total:     totalBookings,
          pending:   pendingBookings,
          active:    activeBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
          today:     todayBookings,
        },
        users:       { total: totalUsers },
        technicians: { total: totalTechnicians, available: availableTechnicians },
        revenue: {
          total: revenueResult._sum.totalAmount ?? 0,
          today: todayRevenueResult._sum.totalAmount ?? 0,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/dashboard/charts ─────────────────────────────────────────
export const adminGetDashboardCharts = async (_req: Request, res: Response) => {
  try {
    // Last 7 days bookings count by day
    const days: { date: string; count: number; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const [count, rev] = await Promise.all([
        prisma.booking.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
        prisma.booking.aggregate({
          where: { status: 'COMPLETED', completedAt: { gte: dayStart, lte: dayEnd } },
          _sum:  { totalAmount: true },
        }),
      ]);

      days.push({
        date:    dayStart.toISOString().split('T')[0],
        count,
        revenue: rev._sum.totalAmount ?? 0,
      });
    }

    return res.json({ success: true, data: { bookingsByDay: days } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
