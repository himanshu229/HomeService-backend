import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';
import {
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminGetServices,
  adminCreateService,
  adminUpdateService,
  adminDeleteService,
  adminToggleServiceStatus,
} from '../controllers/adminController';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// ── Categories ───────────────────────────────────────────────────────────────
router.get   ('/categories',        adminGetCategories);
router.post  ('/categories',        adminCreateCategory);
router.put   ('/categories/:id',    adminUpdateCategory);
router.delete('/categories/:id',    adminDeleteCategory);

// ── Services ─────────────────────────────────────────────────────────────────
router.get   ('/services',          adminGetServices);
router.post  ('/services',          adminCreateService);
router.put   ('/services/:id',      adminUpdateService);
router.delete('/services/:id',      adminDeleteService);
router.patch ('/services/:id/toggle', adminToggleServiceStatus);

export default router;
