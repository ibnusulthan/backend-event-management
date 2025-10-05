import { Router } from 'express';
import authRoutes from './auth';
import eventRoutes from './events';
import transactionRoutes from './transactions';
import reviewRoutes from './review';
import voucherRoutes from './vouchers'
import dashboardRoutes from './dashboard';
import userRoutes from './users';

const router = Router();

router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/transactions', transactionRoutes);
router.use('/reviews', reviewRoutes);
router.use('/vouchers', voucherRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);

export default router;