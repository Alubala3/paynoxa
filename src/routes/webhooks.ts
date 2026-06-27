import { FastifyInstance } from 'fastify';
import { WebhookEndpointSchema } from '../utils/validators.js';
import {
  createWebhookEndpoint,
  getWebhookEndpoints,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookDeliveries,
} from '../modules/webhooks/webhook.service.js';
import { resolveTenant } from '../middleware/auth.js';

export async function webhookRoutes(app: FastifyInstance) {
  // Create webhook endpoint
  app.post<{ Body: any }>('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const tenantId = await resolveTenant(request);
      const data = WebhookEndpointSchema.parse(request.body);

      const endpoint = await createWebhookEndpoint(tenantId, data.url, data.secret);

      reply.status(201).send({
        id: endpoint.id,
        url: endpoint.url,
        enabled: endpoint.enabled,
        created_at: endpoint.created_at,
      });
    } catch (error: any) {
      reply.status(error.statusCode || 400).send({ error: error.message });
    }
  });

  // List webhook endpoints
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const tenantId = await resolveTenant(request);
      const endpoints = await getWebhookEndpoints(tenantId);
      reply.send(endpoints);
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });

  // Update webhook endpoint
  app.patch<{ Params: { id: string }; Body: any }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      try {
        const tenantId = await resolveTenant(request);
        const { id } = request.params;
        const { url, enabled } = request.body;

        const updated = await updateWebhookEndpoint(id, tenantId, {
          url,
          enabled,
        });

        reply.send(updated);
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );

  // Delete webhook endpoint
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      try {
        const tenantId = await resolveTenant(request);
        const { id } = request.params;

        await deleteWebhookEndpoint(id, tenantId);
        reply.send({ success: true });
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );

  // Get webhook delivery attempts
  app.get<{ Params: { id: string } }>(
    '/:id/deliveries',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      try {
        const tenantId = await resolveTenant(request);
        const { id } = request.params;
        const query = request.query as any;

        const result = await getWebhookDeliveries(
          id,
          tenantId,
          parseInt(query.skip || '0'),
          parseInt(query.take || '50')
        );

        reply.send(result);
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );
}