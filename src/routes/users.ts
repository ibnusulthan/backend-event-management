// routes/userRoutes.ts
import { Router } from 'express';
import { 
  getUserProfile, 
  getUserPoints, 
  getUserCoupons 
} from '../controllers/userController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/profile', authenticate, getUserProfile);
router.get('/points', authenticate, getUserPoints);
router.get('/coupons', authenticate, getUserCoupons);

export default router;