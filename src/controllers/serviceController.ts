import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export const getCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.serviceCategory.findMany({
      include: { _count: { select: { services: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: { categories } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getServicesByCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params as { categoryId: string };
    const services = await prisma.service.findMany({
      where: { categoryId },
      include: { category: { select: { name: true, emoji: true, color: true } } },
      orderBy: { popular: 'desc' },
    });
    return res.json({ success: true, data: { services } });
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
    return res.json({ success: true, data: { service } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const searchServices = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: { services: [] } });
    const services = await prisma.service.findMany({
      where: {
        OR: [
          { name: { contains: q as string, mode: 'insensitive' } },
          { aboutService: { contains: q as string, mode: 'insensitive' } },
          { category: { name: { contains: q as string, mode: 'insensitive' } } },
        ],
      },
      include: { category: { select: { name: true, emoji: true, color: true } } },
      take: 20,
    });
    return res.json({ success: true, data: { services } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getPopularServices = async (_req: Request, res: Response) => {
  try {
    const services = await prisma.service.findMany({
      where: { popular: true },
      include: { category: { select: { name: true, emoji: true, color: true } } },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: { services } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
