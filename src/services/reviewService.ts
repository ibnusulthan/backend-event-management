// services/reviewService.ts - PERBAIKAN
import { prisma } from '../utils/prisma';
import { ReviewCreateRequest } from '../types';

export class ReviewService {
  async createReview(userId: string, eventId: string, transactionId: string, reviewData: ReviewCreateRequest) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Validasi input
        if (!userId || !eventId || !transactionId) {
          throw new Error('User ID, Event ID, and Transaction ID are required');
        }

        // Check if transaction exists and user attended the event
        const transaction = await tx.transaction.findFirst({
          where: {
            id: transactionId,
            userId,
            eventId,
            status: { in: ['DONE', 'SUCCESS', 'CONFIRMED'] }, // Include multiple success statuses
          },
          include: {
            attendee: true,
          },
        });

        if (!transaction) {
          throw new Error('You can only review events you have attended. Transaction not found or not completed.');
        }

        // Check if user already reviewed this event for this transaction
        const existingReview = await tx.review.findFirst({
          where: {
            userId,
            eventId,
            transactionId,
          },
        });

        if (existingReview) {
          throw new Error('You have already reviewed this event for this transaction');
        }

        // Create review
        const review = await tx.review.create({
          data: {
            userId,
            eventId,
            transactionId,
            rating: reviewData.rating,
            comment: reviewData.comment,
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                profilePicture: true,
              },
            },
            event: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        });

        return review;
      });
    } catch (error) {
      console.error('Error in createReview:', error);
      throw error; // Re-throw the error untuk ditangkap di controller
    }
  }

  async getEventReviews(eventId: string, page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where: { 
            eventId,
            isActive: true
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.review.count({ 
          where: { 
            eventId,
            isActive: true 
          } 
        }),
      ]);

      const averageRating = await prisma.review.aggregate({
        where: { 
          eventId,
          isActive: true 
        },
        _avg: { rating: true },
      });

      return {
        reviews,
        averageRating: averageRating._avg.rating || 0,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error in getEventReviews:', error);
      throw new Error('Failed to retrieve event reviews');
    }
  }

  async getUserReviews(userId: string, page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where: { 
            userId,
            isActive: true
          },
          include: {
            event: {
              select: {
                id: true,
                title: true,
                imageUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.review.count({ 
          where: { 
            userId,
            isActive: true
          } 
        }),
      ]);

      return {
        reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error in getUserReviews:', error);
      throw new Error('Failed to retrieve user reviews');
    }
  }

  async updateReview(reviewId: string, userId: string, updateData: Partial<ReviewCreateRequest>) {
    try {
      const review = await prisma.review.findFirst({
        where: {
          id: reviewId,
          userId,
          isActive: true
        },
      });

      if (!review) {
        throw new Error('Review not found or access denied');
      }

      return await prisma.review.update({
        where: { id: reviewId },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              profilePicture: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error in updateReview:', error);
      throw error;
    }
  }

  async deleteReview(reviewId: string, userId: string) {
    try {
      const review = await prisma.review.findFirst({
        where: {
          id: reviewId,
          userId,
        },
      });

      if (!review) {
        throw new Error('Review not found or access denied');
      }

      // Soft delete dengan mengupdate isActive menjadi false
      await prisma.review.update({
        where: { id: reviewId },
        data: { isActive: false },
      });

      return { message: 'Review deleted successfully' };
    } catch (error) {
      console.error('Error in deleteReview:', error);
      throw error;
    }
  }
}