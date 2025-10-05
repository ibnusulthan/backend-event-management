// services/userService.ts - PERBAIKAN
import { prisma } from '../utils/prisma';

export class UserService {
  async getUserProfile(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          profilePicture: true,
          phoneNumber: true,
          address: true,
          referralCode: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      console.error('Error in getUserProfile:', error);
      throw new Error('Failed to retrieve user profile');
    }
  }

  async getUserPoints(userId: string) {
    try {
      // Validasi user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      const points = await prisma.userPoint.aggregate({
        where: { 
          userId, 
          isExpired: false,
          expiryDate: { gte: new Date() }
        },
        _sum: { amount: true },
      });

      return { 
        points: points._sum.amount || 0 
      };
    } catch (error) {
      console.error('Error in getUserPoints:', error);
      throw new Error('Failed to retrieve user points');
    }
  }

  async getUserCoupons(userId: string) {
    try {
      // Validasi user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      const coupons = await prisma.userCoupon.findMany({
        where: { 
          userId, 
          isUsed: false,
          expiryDate: { gte: new Date() }
        },
        include: { 
          couponTemplate: {
            select: {
              id: true,
              name: true,
              description: true,
              discountType: true,
              discountValue: true,
              minPurchaseAmount: true,
              maxDiscountAmount: true,
            }
          } 
        },
        orderBy: { createdAt: 'desc' }
      });

      return coupons;
    } catch (error) {
      console.error('Error in getUserCoupons:', error);
      throw new Error('Failed to retrieve user coupons');
    }
  }
}