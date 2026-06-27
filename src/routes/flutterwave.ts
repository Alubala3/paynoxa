import { FastifyInstance } from 'fastify';
import { handleFlutterwaveCallback } from '../modules/flutterwave/flutterwave.service.js';
import { sendReceipt } from '../modules/receipts/receipt.service.js';
import { enqueueWebhookDelivery } from '../modules/webhooks/webhook.service.js';

export async function flutterwaveRoutes(app: FastifyInstance) {
  // Public callback endpoint (called by Flutterwave after payment)
  app.post('/callback', async (request, reply) => {
    try {
      const { tx_ref, status } = request.body;

      if (!tx_ref) {
        return reply.status(400).send({ error: 'Missing tx_ref' });
      }

      // Handle callback
      const result = await handleFlutterwaveCallback(tx_ref);

      // Send receipt if successful
      if (result.status === 'success') {
        const payment = await app.prisma.payment.findFirst({
          where: { provider_reference: tx_ref },
        });

        if (payment) {
          // Send receipt
          await sendReceipt(payment.id);

          // Queue webhook delivery
          const webhookEndpoints = await app.prisma.webhookEndpoint.findMany({
            where: { tenant_id: payment.tenant_id, enabled: true },
          });

          for (const endpoint of webhookEndpoints) {
            await enqueueWebhookDelivery(endpoint.id, payment.id, 'payment.success');
          }
        }
      }

      reply.send({ success: true, status: result.status });
    } catch (error: any) {
      app.log.error(error);
      reply.status(400).send({ error: error.message });
    }
  });

  // Redirect endpoint (where user returns after payment)
  app.get('/redirect', async (request, reply) => {
    try {
      const { tx_ref, status } = request.query as any;

      // Verify payment
      const payment = await app.prisma.payment.findFirst({
        where: { provider_reference: tx_ref },
      });

      if (!payment) {
        return reply.redirect(`${process.env.FRONTEND_BASE_URL}/payment/not-found`);
      }

      if (payment.status === 'success') {
        const redirectUrl = payment.callback_url || `${process.env.FRONTEND_BASE_URL}/payment/success?id=${payment.id}`;
        return reply.redirect(redirectUrl);
      } else if (payment.status === 'failed') {
        const redirectUrl = `${process.env.FRONTEND_BASE_URL}/payment/failed?id=${payment.id}`;
        return reply.redirect(redirectUrl);
      } else {
        return reply.redirect(`${process.env.FRONTEND_BASE_URL}/payment/pending?id=${payment.id}`);
      }
    } catch (error: any) {
      app.log.error(error);
      reply.redirect(`${process.env.FRONTEND_BASE_URL}/payment/error`);
    }
  });
}