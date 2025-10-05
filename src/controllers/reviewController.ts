import { Response } from 'express';
import { AuthRequest } from '../types';
import { ReviewService } from '../services/reviewService';
import { handleValidationErrors } from '../middleware/validation';

const reviewService = new ReviewService();

export const createReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // PERBAIKAN: eventId diambil dari body, bukan params
    const { eventId, transactionId, rating, comment } = req.body;

    // Validasi input yang lebih ketat
    if (!eventId || !transactionId || !rating) {
      res.status(400).json({
        success: false,
        message: 'Event ID, Transaction ID, and rating are required'
      });
      return;
    }

    if (rating < 1 || rating > 5) {
      res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
      return;
    }

    const review = await reviewService.createReview(
      req.user.id,
      eventId,
      transactionId,
      { rating, comment }
    );

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: review,
    });
  } catch (error: any) {
    // Handle specific errors dengan lebih baik
    if (error.message.includes('attended') || 
        error.message.includes('already reviewed') ||
        error.message.includes('required')) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    } else if (error.message.includes('not found') || 
               error.message.includes('not exist')) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      console.error('Create review error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
};

export const getEventReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      res.status(400).json({
        success: false,
        message: 'Event ID is required'
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // Validasi pagination
    if (page < 1 || limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters'
      });
      return;
    }

    const result = await reviewService.getEventReviews(eventId, page, limit);

    res.status(200).json({
      success: true,
      message: 'Event reviews retrieved successfully',
      data: {
        reviews: result.reviews,
        averageRating: result.averageRating,
      },
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Get event reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve event reviews',
    });
  }
};

export const getUserReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // Validasi pagination
    if (page < 1 || limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters'
      });
      return;
    }

    const result = await reviewService.getUserReviews(req.user.id, page, limit);

    res.status(200).json({
      success: true,
      message: 'User reviews retrieved successfully',
      data: result.reviews,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Get user reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user reviews',
    });
  }
};

export const updateReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    if (!reviewId) {
      res.status(400).json({
        success: false,
        message: 'Review ID is required'
      });
      return;
    }

    if (rating && (rating < 1 || rating > 5)) {
      res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
      return;
    }

    const review = await reviewService.updateReview(reviewId, req.user.id, {
      rating,
      comment,
    });

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: review,
    });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      console.error('Update review error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update review',
      });
    }
  }
};

export const deleteReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { reviewId } = req.params;

    if (!reviewId) {
      res.status(400).json({
        success: false,
        message: 'Review ID is required'
      });
      return;
    }

    const result = await reviewService.deleteReview(reviewId, req.user.id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      console.error('Delete review error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete review',
      });
    }
  }
};