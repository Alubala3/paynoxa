import { FastifyInstance } from 'fastify';
import { PaymentCreateSchema } from '../utils/validators.js';
import { createPayment, getPayment, listPayments } from '../modules/payments/payments.service.js';
import { initializePayment } from '../modules/flutterwave/flutterwave.service.js';
import { resolveApiKeyTenant } from '../middleware/auth.js';

export async function paymentRoutes(app: FastifyInstance) {
  // Create payment
  app.post<{ Body: any }>('/', async (request, reply) => {
    try {
      const { apiKey, tenant } = await resolveApiKeyTenant(request, app.prisma);

      // Validate request body
      const data = PaymentCreateSchema.parse(request.body);

      // Create payment
      const payment = await createPayment({
        tenantId: tenant.id,
        amount: data.amount,
        currency: data.currency,
        customer: data.customer,
        metadata: data.metadata,
        callback_url: data.callback_url,
        idempotency_key: data.idempotency_key,
        mode: data.mode,
      });

      // Initialize Flutterwave payment
      const flutterResult = await initializePayment(payment, tenant);

      reply.status(201).send({
        id: payment.id,
        status: payment.status,
        checkout_url: flutterResult.checkout_url,
        amount: payment.amount,
        currency: payment.currency,
      });
    } catch (error: any) {
      app.log.error(error);
      reply.status(error.statusCode || 400).send({
        error: error.message,
        code: error.code || 'PAYMENT_ERROR',
      });
    }
  });

  // Get payment
  app.get<{ Params: { id: string } }>('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const user = request.user as any;
      const tenantId = user.tenant_id;
      const { id } = request.params;

      const payment = await getPayment(id, tenantId);
      reply.send(payment);
    } catch (error: any) {
      reply.status(error.statusCode || 400).send({ error: error.message });
    }
  });

  // List payments
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const user = request.user as any;
      const tenantId = user.tenant_id;
      const query = request.query as any;

      const result = await listPayments(tenantId, {
        status: query.status,
        mode: query.mode,
        skip: parseInt(query.skip || '0'),
        take: parseInt(query.take || '50'),
      });

      reply.send(result);
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });
}