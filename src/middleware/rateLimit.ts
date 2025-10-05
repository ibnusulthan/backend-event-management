import rateLimit from 'express-rate-limit';

// Rate limiting untuk voucher validation
export const voucherLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 attempts per window
  message: {
    error: 'Too many voucher validation attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting untuk transaction creation
export const transactionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Max 5 transactions per minute
  message: {
    error: 'Too many transaction attempts, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
});