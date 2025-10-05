// routes/review.ts - FINAL FIX
import { Router } from 'express';
import {
  createReview,
  getEventReviews,
  getUserReviews,
  updateReview,
  deleteReview,
} from '../controllers/reviewController';
import { validateReviewCreate, handleValidationErrors } from '../middleware/validation';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/event/:eventId', getEventReviews);

// Protected routes
router.post(
  '/',
  authenticate,
  authorize('CUSTOMER'),
  validateReviewCreate,
  handleValidationErrors,
  createReview
);

router.get('/user/my-reviews', authenticate, authorize('CUSTOMER'), getUserReviews);
router.put('/:reviewId', authenticate, authorize('CUSTOMER'), validateReviewCreate, handleValidationErrors, updateReview);
router.delete('/:reviewId', authenticate, authorize('CUSTOMER'), deleteReview);

export default router;