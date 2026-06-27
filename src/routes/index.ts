import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { tenantRoutes } from './tenants.js';
import { apiKeyRoutes } from './api-keys.js';
import { paymentRoutes } from './payments.js';
import { flutterwaveRoutes } from './flutterwave.js';
import { webhookRoutes } from './webhooks.js';
import { hostedPageRoutes } from './hosted-pages.js';
import { adminRoutes } from './admin.js';

export async function registerRoutes(app: FastifyInstance) {
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(tenantRoutes, { prefix: '/api/tenants' });
  app.register(apiKeyRoutes, { prefix: '/api/keys' });
  app.register(paymentRoutes, { prefix: '/api/payments' });
  app.register(flutterwaveRoutes, { prefix: '/api/flutterwave' });
  app.register(webhookRoutes, { prefix: '/api/webhooks' });
  app.register(hostedPageRoutes, { prefix: '/api/hosted-pages' });
  app.register(adminRoutes, { prefix: '/api/admin' });
}