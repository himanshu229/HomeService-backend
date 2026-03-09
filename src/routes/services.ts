import { Router } from 'express';
import {
  getCategories, getServicesByCategory, getServiceById,
  searchServices, getPopularServices,
} from '../controllers/serviceController';

const router = Router();

router.get('/categories', getCategories);
router.get('/popular', getPopularServices);
router.get('/search', searchServices);
router.get('/category/:categoryId', getServicesByCategory);
router.get('/:id', getServiceById);

export default router;
