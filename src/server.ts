import app from './app';
import prisma from './utils/prisma';

const PORT = parseInt(process.env.PORT || '5000', 10);

async function main() {
  // Test DB connection
  await prisma.$connect();
  console.log('✅ Database connected');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SummerFix API running on http://0.0.0.0:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/health`);
  });
}

main().catch(err => {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
});
