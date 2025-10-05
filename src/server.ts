import app from './app';
import { prisma } from './utils/prisma';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    console.log('🔧 Starting server...');
    
    // Test database connection
    console.log('📡 Connecting to database...');
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Start server
    const server = app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log('🚀 Server STARTED SUCCESSFULLY!');
      console.log('='.repeat(50));
      console.log(`📍 Local: http://localhost:${PORT}`);
      console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
      console.log(`🔗 Health: http://localhost:${PORT}/health`);
      console.log(`🎯 API: http://localhost:${PORT}/api`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log('='.repeat(50));
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
console.log('🔄 Initializing server...');
startServer();