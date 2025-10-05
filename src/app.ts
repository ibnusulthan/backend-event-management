import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import routes from './routes';
import users from './routes/users'; // Import user routes
import reviewRoutes from './routes/review'; // Import review routes
import { TransactionExpiryService } from './services/transactionExpiryService';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { validateEnv } from './utils/envValidator';


// Validate environment variables on startup
validateEnv();

const app = express();

// ================== SECURITY MIDDLEWARE ==================

// Helmet security headers dengan configuration khusus
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding if needed
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://yourdomain.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const voucherLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 voucher validation attempts per window
  message: {
    success: false,
    message: 'Too many voucher validation attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const transactionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Max 10 transaction attempts per minute
  message: {
    success: false,
    message: 'Too many transaction attempts, please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use(generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/vouchers/validate', voucherLimiter);
app.use('/api/transactions', transactionLimiter);

// ================== PERFORMANCE MIDDLEWARE ==================

// Compression (gzip)
app.use(compression({
  level: 6,
  threshold: 1024, // Compress responses larger than 1KB
}));

// ================== BODY PARSING MIDDLEWARE ==================

app.use(express.json({ 
  limit: '10mb',
  verify: (req: any, res, buf) => {
    req.rawBody = buf; // Save raw body for signature verification if needed
  }
}));

app.use(express.urlencoded({ 
  extended: true,
  limit: '10mb'
}));

// Cookie parser
app.use(cookieParser());

// Protect against HTTP Parameter Pollution attacks
app.use(hpp());

// ================== LOGGING MIDDLEWARE ==================

// Custom request logger
app.use(requestLogger);

// Morgan logging dengan format yang lebih informatif
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400, // Log only errors in production
  }));
} else {
  app.use(morgan('dev'));
}

// ================== STATIC FILES ==================

// Static files dengan security headers
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d', // Cache for 1 day
  setHeaders: (res, path) => {
    // Security headers for static files
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
  }
}));

// Public assets
app.use('/public', express.static(path.join(__dirname, '../public'), {
  maxAge: '7d', // Cache for 7 days
}));

// ================== REQUEST PROCESSING ==================

// Add request ID to each request
app.use((req: any, res, next) => {
  req.requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  next();
});

// Security headers middleware
app.use((req, res, next) => {
  // Remove fingerprinting headers
  res.removeHeader('X-Powered-By');
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  
  next();
});

// ================== ROUTES ==================

// API routes
app.use('/api', routes);
app.use('/api/users', users); // User features routes
app.use('/api/reviews', reviewRoutes); // Review routes - TAMBAHKAN INI

// ================== HEALTH CHECKS ==================

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Detailed health check (for monitoring systems)
app.get('/health/detailed', async (req, res) => {
  const healthCheck = {
    success: true,
    message: 'Service is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: 'unknown',
      memory: 'healthy',
      disk: 'healthy',
    }
  };

  try {
    // Check database connectivity
    const { prisma } = await import('./utils/prisma');
    await prisma.$queryRaw`SELECT 1`;
    healthCheck.checks.database = 'healthy';
  } catch (error) {
    healthCheck.success = false;
    healthCheck.message = 'Service unhealthy';
    healthCheck.checks.database = 'unhealthy';
    console.error('Database health check failed:', error);
  }

  const status = healthCheck.success ? 200 : 503;
  res.status(status).json(healthCheck);
});

// ================== SERVICE INITIALIZATION ==================

// Initialize background services
const initializeServices = () => {
  try {
    // Start transaction expiry service
    const transactionExpiryService = new TransactionExpiryService();
    transactionExpiryService.start();
    
    console.log('✅ Background services initialized');
  } catch (error) {
    console.error('❌ Failed to initialize background services:', error);
  }
};

// Initialize services after server starts
setTimeout(initializeServices, 5000);

// ================== ERROR HANDLING ==================

// 404 handler - untuk API routes
// 404 handler - untuk API routes
app.use(/\/api\//, (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    suggestion: 'Check the API documentation for available endpoints'
  });
});


// 404 handler - untuk non-API routes
app.use((req, res) => {
  if (req.accepts('html')) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>404 - Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #666; }
          </style>
        </head>
        <body>
          <h1>404 - Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
          <a href="/">Go to Homepage</a>
        </body>
      </html>
    `);
  } else {
    res.status(404).json({
      success: false,
      message: 'Resource not found',
    });
  }
});

// Central error handling middleware
app.use(errorHandler);

// ================== GRACEFUL SHUTDOWN ==================

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, starting graceful shutdown');
  
  try {
    // Close database connections
    const { prisma } = await import('./utils/prisma');
    await prisma.$disconnect();
    
    console.log('✅ Database connections closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, starting graceful shutdown');
  
  try {
    const { prisma } = await import('./utils/prisma');
    await prisma.$disconnect();
    
    console.log('✅ Database connections closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log to monitoring service
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log to monitoring service
  process.exit(1);
});

app.use('/users', users);

export default app;