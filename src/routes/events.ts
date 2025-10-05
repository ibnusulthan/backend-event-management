import { Router } from 'express';
import {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  getOrganizerEvents,
  getEventAnalytics,
  updateEventImage
} from '../controllers/eventController';
import {
  validateEventCreate,
  validateEventUpdate,
  validateEventQuery,
  handleValidationErrors,
} from '../middleware/validation';
import { authenticate, authorize, optionalAuth } from '../middleware/auth';
import { uploadEventImage } from '../middleware/upload';

const router = Router();

// Public routes
router.get('/', validateEventQuery, handleValidationErrors, optionalAuth, getEvents);
router.get('/:id', getEventById);

// Protected routes
router.use(authenticate);

// Organizer routes
router.post(
  '/',
  authorize('ORGANIZER'),
  uploadEventImage,
  validateEventCreate,
  handleValidationErrors,
  createEvent
);
router.put(
  '/:id',
  authorize('ORGANIZER'),
  uploadEventImage,
  validateEventUpdate,
  handleValidationErrors,
  updateEvent
);

router.patch(
  '/:id/image',
  authorize('ORGANIZER'),
  uploadEventImage,
  updateEventImage
);

// 🔥 PERBAIKAN: Ganti path yang sesuai dengan Postman test
router.get('/organizer/events', authorize('ORGANIZER'), getOrganizerEvents); // ✅ Match dengan Postman
router.get('/:id/analytics', authorize('ORGANIZER'), getEventAnalytics);

export default router;