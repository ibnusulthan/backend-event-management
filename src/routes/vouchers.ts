import { Router } from 'express';
import {
  createVoucher,
  getEventVouchers,
  getActiveVouchers,
  updateVoucher,
  deleteVoucher,
} from '../controllers/voucherController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public routes - get active vouchers for an event
router.get('/event/:eventId/active', getActiveVouchers);

// Protected routes
// router.use(authenticate); // ❌ HAPUS BARIS INI

// Organizer routes
// 🔥 PERBAIKAN: Ganti semua paths
router.post('/event/:eventId', authenticate, authorize('ORGANIZER'), createVoucher);
router.get('/event/:eventId', authenticate, authorize('ORGANIZER'), getEventVouchers);
router.put('/:voucherId', authenticate, authorize('ORGANIZER'), updateVoucher); // ✅ Hapus /update
router.delete('/:voucherId', authenticate, authorize('ORGANIZER'), deleteVoucher); // ✅ Hapus /delete

export default router;