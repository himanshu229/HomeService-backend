import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';

export const getAddresses = async (req: AuthRequest, res: Response) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return res.json({ success: true, data: { addresses } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const addAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { label, street, city, state, pincode, isDefault } = req.body;

    // If setting as default, clear existing defaults
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.userId },
        data: { isDefault: false },
      });
    }

    // If this is the first address, auto-set as default
    const count = await prisma.address.count({ where: { userId: req.userId } });
    const address = await prisma.address.create({
      data: {
        userId: req.userId!,
        label,
        street,
        city,
        state,
        pincode,
        isDefault: isDefault || count === 0,
      },
    });
    return res.status(201).json({ success: true, data: { address } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { label, street, city, state, pincode, isDefault } = req.body;

    const addr = await prisma.address.findFirst({ where: { id, userId: req.userId } });
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });

    if (isDefault) {
      await prisma.address.updateMany({ where: { userId: req.userId }, data: { isDefault: false } });
    }

    const address = await prisma.address.update({
      where: { id },
      data: { label, street, city, state, pincode, isDefault: isDefault || false },
    });
    return res.json({ success: true, data: { address } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const addr = await prisma.address.findFirst({ where: { id, userId: req.userId } });
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
    await prisma.address.delete({ where: { id } });
    return res.json({ success: true, message: 'Address deleted' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const setDefaultAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const addr = await prisma.address.findFirst({ where: { id, userId: req.userId } });
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
    await prisma.address.updateMany({ where: { userId: req.userId }, data: { isDefault: false } });
    const address = await prisma.address.update({ where: { id }, data: { isDefault: true } });
    return res.json({ success: true, data: { address } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
