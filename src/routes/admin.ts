import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/authMiddleware';

// ── Service / Category admin handlers (existing) ─────────────────────────────
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
  adminToggleServicePopular,
} from '../controllers/serviceController';

// ── Booking admin handlers ────────────────────────────────────────────────────
import {
  adminGetBookings,
  adminGetBookingStats,
  adminGetBookingById,
  adminUpdateBookingStatus,
  adminAssignTechnician,
  adminCancelBooking,
} from '../controllers/bookingController';

// ── Technician admin handlers ─────────────────────────────────────────────────
import {
  adminGetTechnicians,
  adminGetAvailableTechnicians,
  adminGetTechnicianById,
  adminCreateTechnician,
  adminUpdateTechnician,
  adminDeleteTechnician,
  adminToggleTechnicianStatus,
} from '../controllers/technicianController';

// ── Dashboard handlers ────────────────────────────────────────────────────────
import {
  adminGetDashboardStats,
  adminGetDashboardCharts,
} from '../controllers/dashboardController';

// ── User admin handlers ───────────────────────────────────────────────────────
import {
  adminCreateUser,
  adminGetUsers,
  adminGetUserById,
} from '../controllers/userController';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// ── Categories ────────────────────────────────────────────────────────────────
router.get   ('/categories',      adminGetCategories);
router.post  ('/categories',      adminCreateCategory);
router.put   ('/categories/:id',  adminUpdateCategory);
router.delete('/categories/:id',  adminDeleteCategory);

// ── Services ──────────────────────────────────────────────────────────────────
router.get   ('/services',                    adminGetServices);
router.post  ('/services',                    adminCreateService);
router.put   ('/services/:id',                adminUpdateService);
router.delete('/services/:id',                adminDeleteService);
router.patch ('/services/:id/toggle',         adminToggleServiceStatus);
router.patch ('/services/:id/toggle-popular', adminToggleServicePopular);

// ── Bookings — /stats must be before /:id ────────────────────────────────────
router.get   ('/bookings/stats',        adminGetBookingStats);
router.get   ('/bookings',              adminGetBookings);
router.get   ('/bookings/:id',          adminGetBookingById);
router.patch ('/bookings/:id/status',   adminUpdateBookingStatus);
router.patch ('/bookings/:id/assign',   adminAssignTechnician);
router.patch ('/bookings/:id/cancel',   adminCancelBooking);

// ── Technicians — /available must be before /:id ─────────────────────────────
router.get   ('/technicians/available',    adminGetAvailableTechnicians);
router.get   ('/technicians',              adminGetTechnicians);
router.post  ('/technicians',              adminCreateTechnician);
router.get   ('/technicians/:id',          adminGetTechnicianById);
router.put   ('/technicians/:id',          adminUpdateTechnician);
router.delete('/technicians/:id',          adminDeleteTechnician);
router.patch ('/technicians/:id/toggle',   adminToggleTechnicianStatus);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard/stats',  adminGetDashboardStats);
router.get('/dashboard/charts', adminGetDashboardCharts);

// ── Users ─────────────────────────────────────────────────────────────────────
router.post('/users',    adminCreateUser);
router.get('/users',     adminGetUsers);
router.get('/users/:id', adminGetUserById);

export default router;
