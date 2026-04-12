import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';

// ─── GET /api/admin/technicians ───────────────────────────────────────────────
export const adminGetTechnicians = async (req: Request, res: Response) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page   as string) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const search = (req.query.search as string | undefined)?.trim();
    const status = req.query.status as string | undefined;

    // Build isActive / isAvailable filters from status string
    const statusFilter: Record<string, any> = {};
    if (status === 'active')   { statusFilter.isActive = true;  statusFilter.isAvailable = true; }
    if (status === 'inactive') { statusFilter.isActive = false; }
    if (status === 'on_job')   { statusFilter.isActive = true;  statusFilter.isAvailable = false; }

    const where = {
      ...statusFilter,
      ...(search ? {
        OR: [
          { name:  { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [technicians, total] = await Promise.all([
      prisma.technician.findMany({
        where,
        include: {
          _count: { select: { bookings: true, reviews: true } },
          services: { include: { service: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.technician.count({ where }),
    ]);

    const data = technicians.map(t => ({
      id:              t.id,
      name:            t.name,
      phone:           t.phone,
      email:           t.email ?? null,
      avatar:          t.avatar ?? null,
      rating:          t.rating,
      reviewCount:     t.reviewCount,
      experience:      t.experience,
      isAvailable:     t.isAvailable,
      isActive:        t.isActive,
      totalJobs:       t._count.bookings,
      specializations: t.services.map(ts => ts.service.name),
      status:          !t.isActive ? 'inactive' : t.isAvailable ? 'active' : 'on_job',
      joinedAt:        t.createdAt,
    }));

    return res.json({ success: true, data, total, page, limit });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/technicians/available ────────────────────────────────────
export const adminGetAvailableTechnicians = async (_req: Request, res: Response) => {
  try {
    const technicians = await prisma.technician.findMany({
      where:   { isAvailable: true, isActive: true },
      include: {
        services: { include: { service: { select: { id: true, name: true } } } },
      },
      orderBy: { rating: 'desc' },
    });

    const data = technicians.map(t => ({
      id:              t.id,
      name:            t.name,
      phone:           t.phone,
      rating:          t.rating,
      experience:      t.experience,
      specializations: t.services.map(ts => ts.service.name),
    }));

    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/admin/technicians/:id ──────────────────────────────────────────
export const adminGetTechnicianById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const technician = await prisma.technician.findUnique({
      where:   { id },
      include: {
        services: { include: { service: { select: { id: true, name: true } } } },
        bookings: {
          include: { service: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take:    20,
        },
      },
    });
    if (!technician) return res.status(404).json({ success: false, message: 'Technician not found' });

    return res.json({ success: true, data: technician });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Helper: resolve service names → IDs
async function resolveServiceIds(names: string[]): Promise<string[]> {
  if (!names?.length) return [];
  const services = await prisma.service.findMany({
    where: { name: { in: names } },
    select: { id: true },
  });
  return services.map(s => s.id);
}

// Helper: map status string → isActive / isAvailable booleans
function statusToFlags(status?: string): { isActive: boolean; isAvailable: boolean } {
  if (status === 'inactive') return { isActive: false, isAvailable: false };
  if (status === 'on_job')   return { isActive: true,  isAvailable: false };
  return                            { isActive: true,  isAvailable: true };  // 'active' / default
}

// ─── POST /api/admin/technicians ─────────────────────────────────────────────
export const adminCreateTechnician = async (req: Request, res: Response) => {
  try {
    const { name, phone, email, experience = 0, specializations = [], status, avatar } = req.body;

    if (!name?.trim())  return res.status(400).json({ success: false, message: 'Name is required' });
    if (!phone?.trim()) return res.status(400).json({ success: false, message: 'Phone is required' });

    const { isActive, isAvailable } = statusToFlags(status);
    const serviceIds = await resolveServiceIds(specializations);

    const technician = await prisma.technician.create({
      data: {
        name:        name.trim(),
        phone:       phone.trim(),
        email:       email?.trim() || null,
        avatar:      avatar ?? null,
        experience:  Number(experience),
        isActive,
        isAvailable,
        services: {
          create: serviceIds.map(serviceId => ({ serviceId })),
        },
      },
      include: {
        _count:   { select: { bookings: true } },
        services: { include: { service: { select: { id: true, name: true } } } },
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        id:              technician.id,
        name:            technician.name,
        phone:           technician.phone,
        email:           technician.email ?? null,
        avatar:          technician.avatar ?? null,
        rating:          technician.rating,
        reviewCount:     technician.reviewCount,
        experience:      technician.experience,
        isAvailable:     technician.isAvailable,
        isActive:        technician.isActive,
        totalJobs:       technician._count.bookings,
        specializations: technician.services.map(ts => ts.service.name),
        status:          !technician.isActive ? 'inactive' : technician.isAvailable ? 'active' : 'on_job',
        joinedAt:        technician.createdAt,
      },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Phone or email already registered' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PUT /api/admin/technicians/:id ──────────────────────────────────────────
export const adminUpdateTechnician = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { name, phone, email, experience, specializations, status, avatar } = req.body;

    const existing = await prisma.technician.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Technician not found' });

    const updateData: Record<string, any> = {};
    if (name  !== undefined) updateData.name  = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (experience !== undefined) updateData.experience = Number(experience);
    if (status !== undefined) Object.assign(updateData, statusToFlags(status));

    // Re-sync specializations if provided
    if (Array.isArray(specializations)) {
      const serviceIds = await resolveServiceIds(specializations);
      await prisma.technicianService.deleteMany({ where: { technicianId: id } });
      if (serviceIds.length) {
        await prisma.technicianService.createMany({
          data: serviceIds.map(serviceId => ({ technicianId: id, serviceId })),
          skipDuplicates: true,
        });
      }
    }

    const technician = await prisma.technician.update({
      where: { id },
      data:  updateData,
      include: {
        _count:   { select: { bookings: true } },
        services: { include: { service: { select: { id: true, name: true } } } },
      },
    });

    return res.json({
      success: true,
      data: {
        id:              technician.id,
        name:            technician.name,
        phone:           technician.phone,
        email:           technician.email ?? null,
        avatar:          technician.avatar ?? null,
        rating:          technician.rating,
        reviewCount:     technician.reviewCount,
        experience:      technician.experience,
        isAvailable:     technician.isAvailable,
        isActive:        technician.isActive,
        totalJobs:       technician._count.bookings,
        specializations: technician.services.map(ts => ts.service.name),
        status:          !technician.isActive ? 'inactive' : technician.isAvailable ? 'active' : 'on_job',
        joinedAt:        technician.createdAt,
      },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Phone or email already registered' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /api/admin/technicians/:id ───────────────────────────────────────
export const adminDeleteTechnician = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.technician.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Technician not found' });

    await prisma.technician.delete({ where: { id } });
    return res.json({ success: true, message: 'Technician deleted' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
// ─── PATCH /api/admin/technicians/:id/toggle ─────────────────────────────────
export const adminToggleTechnicianStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.technician.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Technician not found' });

    const technician = await prisma.technician.update({
      where: { id },
      data:  { isActive: !existing.isActive },
      include: {
        _count:   { select: { bookings: true } },
        services: { include: { service: { select: { id: true, name: true } } } },
      },
    });

    return res.json({
      success: true,
      data: {
        id:              technician.id,
        name:            technician.name,
        phone:           technician.phone,
        email:           technician.email ?? null,
        avatar:          technician.avatar ?? null,
        rating:          technician.rating,
        reviewCount:     technician.reviewCount,
        experience:      technician.experience,
        isAvailable:     technician.isAvailable,
        isActive:        technician.isActive,
        totalJobs:       technician._count.bookings,
        specializations: technician.services.map(ts => ts.service.name),
        status:          !technician.isActive ? 'inactive' : technician.isAvailable ? 'active' : 'on_job',
        joinedAt:        technician.createdAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};