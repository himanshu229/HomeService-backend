import { Router } from 'express';
import {
  createBooking, getUserBookings, getBookingById,
  cancelBooking, updateBookingStatus, createReview,
} from '../controllers/bookingController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getUserBookings);
router.post('/', createBooking);
router.get('/:id', getBookingById);
router.post('/:id/cancel', cancelBooking);
router.patch('/:id/status', updateBookingStatus);
router.post('/review', createReview);

export default router;
