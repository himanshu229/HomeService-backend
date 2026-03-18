import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export const getCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.serviceCategory.findMany({
      include: { _count: { select: { services: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return res.json({ success: true, data: categories });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getServicesByCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params as { categoryId: string };
    const services = await prisma.service.findMany({
      where: { categoryId, isActive: true },
      include: { category: { select: { name: true, emoji: true } } },
      orderBy: { popular: 'desc' },
    });
    return res.json({ success: true, data: services });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getServiceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        category: true,
        _count: { select: { bookings: true } },
      },
    });
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    return res.json({ success: true, data: service });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const searchServices = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const services = await prisma.service.findMany({
      where: {
        OR: [
          { name: { contains: q as string, mode: 'insensitive' } },
          { aboutService: { contains: q as string, mode: 'insensitive' } },
          { category: { name: { contains: q as string, mode: 'insensitive' } } },
        ],
      },
      include: { category: { select: { name: true, emoji: true } } },
      take: 20,
    });
    return res.json({ success: true, data: services });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getPopularServices = async (_req: Request, res: Response) => {
  try {
    const services = await prisma.service.findMany({
      where: { popular: true },
      include: { category: { select: { name: true, emoji: true } } },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: services });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Helper: slugify ──────────────────────────────────────────────────────────
const slugify = (str: string) =>
  str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Normalize Prisma service row to DTO the frontend expects ─────────────────
const toServiceDto = (s: any) => ({
  ...s,
  status:        s.isActive ? 'published' : 'unpublished',
  aboutService:  s.aboutService ?? '',
  whatsIncluded: s.whatsIncluded ?? '',
});

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — CATEGORIES
// ══════════════════════════════════════════════════════════════════════════════

export const adminGetCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.serviceCategory.findMany({
      include: { _count: { select: { services: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: categories });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminCreateCategory = async (req: Request, res: Response) => {
  try {
    const { name, emoji } = req.body as { name: string; emoji: string };
    if (!name?.trim() || !emoji?.trim()) {
      return res.status(400).json({ success: false, message: 'Name and emoji are required' });
    }

    const existing = await prisma.serviceCategory.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: `Category "${name.trim()}" already exists` });
    }

    const slug = slugify(name.trim());
    const category = await prisma.serviceCategory.create({
      data: {
        name:  name.trim(),
        slug,
        emoji: emoji.trim(),
      },
    });
    return res.status(201).json({ success: true, data: category });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminUpdateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { name, emoji } = req.body as { name?: string; emoji?: string };

    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (name) {
      const dup = await prisma.serviceCategory.findFirst({
        where: { name: { equals: name.trim(), mode: 'insensitive' }, NOT: { id } },
      });
      if (dup) {
        return res.status(409).json({ success: false, message: `Category "${name.trim()}" already exists` });
      }
    }

    const updated = await prisma.serviceCategory.update({
      where: { id },
      data: {
        ...(name  ? { name: name.trim(), slug: slugify(name.trim()) } : {}),
        ...(emoji ? { emoji: emoji.trim() } : {}),
      },
    });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminDeleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    await prisma.serviceCategory.delete({ where: { id } });
    return res.json({ success: true, message: 'Category deleted' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN — SERVICES
// ══════════════════════════════════════════════════════════════════════════════

export const adminGetServices = async (req: Request, res: Response) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit    = Math.min(100, parseInt(req.query.limit as string) || 10);
    const search   = (req.query.search   as string) || '';
    const category = (req.query.category as string) || '';
    const status   = (req.query.status   as string) || '';

    const where: any = {};
    if (search)   where.name     = { contains: search, mode: 'insensitive' };
    if (category) where.category = { name: { equals: category, mode: 'insensitive' } };
    if (status === 'published')   where.isActive = true;
    if (status === 'unpublished') where.isActive = false;

    const [data, total] = await Promise.all([
      prisma.service.findMany({
        where,
        include: { category: { select: { id: true, name: true, emoji: true } } },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.service.count({ where }),
    ]);

    return res.json({ success: true, data: data.map(toServiceDto), total, page, limit });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminCreateService = async (req: Request, res: Response) => {
  try {
    const { name, categoryId, price, warranty, aboutService, whatsIncluded } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Service name is required' });
    }

    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }

    const cat = await prisma.serviceCategory.findUnique({ where: { id: categoryId } });
    if (!cat) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }

    const slug = slugify(name.trim()) + '-' + Date.now();
    const service = await prisma.service.create({
      data: {
        name:          name.trim(),
        slug,
        aboutService:  aboutService ?? '',
        whatsIncluded: whatsIncluded ?? '',
        price:         parseFloat(price) || 0,
        duration:      0,
        emoji:         cat.emoji,
        warranty:      warranty ?? '',
        categoryId,
        isActive:      false,
      },
    });
    return res.status(201).json({ success: true, data: toServiceDto(service) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminUpdateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { name, categoryId, price, warranty, aboutService, whatsIncluded } = req.body;

    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });

    const updated = await prisma.service.update({
      where: { id },
      data: {
        ...(name              ? { name: name.trim(), slug: slugify(name.trim()) + '-' + id } : {}),
        ...(categoryId        ? { categoryId } : {}),
        ...(price !== undefined         ? { price: parseFloat(price) || 0 } : {}),
        ...(warranty    !== undefined   ? { warranty } : {}),
        ...(aboutService !== undefined  ? { aboutService } : {}),
        ...(whatsIncluded !== undefined ? { whatsIncluded } : {}),
      },
    });
    return res.json({ success: true, data: toServiceDto(updated) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminDeleteService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });
    await prisma.service.delete({ where: { id } });
    return res.json({ success: true, message: 'Service deleted' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminToggleServiceStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });
    const updated = await prisma.service.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
    return res.json({ success: true, data: toServiceDto(updated) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminToggleServicePopular = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });
    const updated = await prisma.service.update({
      where: { id },
      data: { popular: !existing.popular },
    });
    return res.json({ success: true, data: toServiceDto(updated) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
