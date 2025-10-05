// controllers/userController.ts - PERBAIKAN
import { Response } from 'express';
import { AuthRequest } from '../types';
import { UserService } from '../services/userService';

const userService = new UserService();

export const getUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const profile = await userService.getUserProfile(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: profile,
    });
  } catch (error: any) {
    console.error('Get user profile error:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user profile',
      });
    }
  }
};

export const getUserPoints = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const points = await userService.getUserPoints(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Points retrieved successfully',
      data: points,
    });
  } catch (error: any) {
    console.error('Get user points error:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user points',
      });
    }
  }
};

export const getUserCoupons = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const coupons = await userService.getUserCoupons(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Coupons retrieved successfully',
      data: coupons,
    });
  } catch (error: any) {
    console.error('Get user coupons error:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user coupons',
      });
    }
  }
};