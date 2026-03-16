import { Request, Response } from 'express';
import prisma from '../utils/prisma';

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
//  CATEGORIES
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

    // Duplicate name check
    const existing = await prisma.serviceCategory.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: `Category "${name.trim()}" already exists` });
    }

    const slug = slugify(name.trim());
    const category = await prisma.serviceCategory.create({
      data: {
        name:        name.trim(),
        slug,
        emoji:       emoji.trim(),
        description: '',
        color:       '#1A73E8',
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

    // Duplicate name check (exclude self)
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
//  SERVICES
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

    // Resolve categoryId — accept either an ID or fall back to lookup by name
    let resolvedCategoryId: string = categoryId;
    if (!resolvedCategoryId) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }
    // Verify the category exists
    const cat = await prisma.serviceCategory.findUnique({ where: { id: resolvedCategoryId } });
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
        emoji:         '🔧',
        warranty:      warranty ?? '',
        categoryId:    resolvedCategoryId,
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
        ...(name          ? { name: name.trim(), slug: slugify(name.trim()) + '-' + id } : {}),
        ...(categoryId    ? { categoryId } : {}),
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
