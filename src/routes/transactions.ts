import { Router } from 'express';
import {
  createTransaction,
  uploadPaymentProof,
  confirmTransaction,
  getUserTransactions,
  getEventTransactions,
  getTransactionById, // ✅ SEKARANG SUDAH ADA
  cancelTransaction   // ✅ SEKARANG SUDAH ADA
} from '../controllers/transactionController';
import {
  validateTransactionCreate,
  handleValidationErrors,
} from '../middleware/validation';
import { authenticate, authorize } from '../middleware/auth';
import { uploadPaymentProof as uploadMiddleware } from '../middleware/upload';

const router = Router();

// Customer routes
router.post(
  '/',
  authenticate,
  authorize('CUSTOMER'),
  validateTransactionCreate,
  handleValidationErrors,
  createTransaction
);

router.get('/user', authenticate, authorize('CUSTOMER'), getUserTransactions);

router.get('/:id', authenticate, authorize('CUSTOMER'), getTransactionById);

router.post(
  '/:transactionId/payment-proof',
  authenticate,
  authorize('CUSTOMER'),
  uploadMiddleware,
  uploadPaymentProof
);

router.patch('/:id/cancel', authenticate, authorize('CUSTOMER'), cancelTransaction);

// Organizer routes
router.post(
  '/:transactionId/confirm',
  authenticate,
  authorize('ORGANIZER'),
  confirmTransaction
);

router.get('/event/:eventId', authenticate, authorize('ORGANIZER'), getEventTransactions);

export default router;