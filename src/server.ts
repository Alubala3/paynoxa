import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { env, validateEnv } from './config/env.js';
import { registerRoutes } from './routes/index.js';

validateEnv();

const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL);

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  },
});

// Register plugins
app.register(fastifyCors, {
  origin: [env.FRONTEND_BASE_URL, 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
});

app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
  sign: { expiresIn: env.JWT_EXPIRY },
});

// Attach services to app
app.decorate('prisma', prisma);
app.decorate('redis', redis);

// Health check
app.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date() };
});

// Register all routes
await registerRoutes(app);

// Error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
  });
});

// Graceful shutdown
const closeGracefully = async (signal: string) => {
  app.log.info(`Received ${signal}, closing gracefully...`);
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

// Start server
const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server running at http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export default app;