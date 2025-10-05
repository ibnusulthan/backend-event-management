import { Response } from 'express';
import { AuthRequest } from '../types';
import { TransactionService } from '../services/transactionService';
import { handleValidationErrors } from '../middleware/validation';

const transactionService = new TransactionService();

export const createTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    handleValidationErrors(req, res, () => {});

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const transaction = await transactionService.createTransaction(req.user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: transaction,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const uploadPaymentProof = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Payment proof file is required',
      });
      return;
    }

    const { transactionId } = req.params;

    const payment = await transactionService.uploadPaymentProof(
      transactionId,
      req.user.id,
      req.file
    );

    res.status(200).json({
      success: true,
      message: 'Payment proof uploaded successfully',
      data: payment,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const confirmTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { transactionId } = req.params;
    const { isAccepted } = req.body;

    const transaction = await transactionService.confirmTransaction(
      transactionId,
      req.user.id,
      isAccepted
    );

    const statusMessage = isAccepted ? 'accepted' : 'rejected';

    res.status(200).json({
      success: true,
      message: `Transaction ${statusMessage} successfully`,
      data: transaction,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getUserTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const result = await transactionService.getUserTransactions(req.user.id, page, limit);

    res.status(200).json({
      success: true,
      message: 'User transactions retrieved successfully',
      data: result.transactions,
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getEventTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { eventId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await transactionService.getEventTransactions(
      eventId,
      req.user.id,
      page,
      limit
    );

    res.status(200).json({
      success: true,
      message: 'Event transactions retrieved successfully',
      data: result.transactions,
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getTransactionById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { id } = req.params;

    const transaction = await transactionService.getTransactionById(id, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Transaction retrieved successfully',
      data: transaction,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
};

export const cancelTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { id } = req.params;

    const transaction = await transactionService.cancelTransaction(id, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Transaction cancelled successfully',
      data: transaction,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};