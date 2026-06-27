import { FastifyInstance } from 'fastify';
import { HostedPageCreateSchema } from '../utils/validators.js';
import {
  createHostedPage,
  getHostedPageBySlug,
  getHostedPage,
  listHostedPages,
  updateHostedPage,
  deleteHostedPage,
} from '../modules/hosted-pages/hosted-page.service.js';
import { resolveTenant } from '../middleware/auth.js';
import { createPayment } from '../modules/payments/payments.service.js';
import { initializePayment } from '../modules/flutterwave/flutterwave.service.js';

export async function hostedPageRoutes(app: FastifyInstance) {
  // Create hosted page
  app.post<{ Body: any }>('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const tenantId = await resolveTenant(request);
      const data = HostedPageCreateSchema.parse(request.body);

      const page = await createHostedPage(tenantId, data);
      reply.status(201).send(page);
    } catch (error: any) {
      reply.status(error.statusCode || 400).send({ error: error.message });
    }
  });

  // List hosted pages
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const tenantId = await resolveTenant(request);
      const pages = await listHostedPages(tenantId);
      reply.send(pages);
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });

  // Get hosted page detail
  app.get<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      try {
        const tenantId = await resolveTenant(request);
        const { id } = request.params;

        const page = await getHostedPage(id, tenantId);
        reply.send(page);
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );

  // Update hosted page
  app.patch<{ Params: { id: string }; Body: any }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      try {
        const tenantId = await resolveTenant(request);
        const { id } = request.params;

        const updated = await updateHostedPage(id, tenantId, request.body);
        reply.send(updated);
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );

  // Delete hosted page
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      try {
        const tenantId = await resolveTenant(request);
        const { id } = request.params;

        await deleteHostedPage(id, tenantId);
        reply.send({ success: true });
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );

  // Public hosted page view (no auth required)
  app.get<{ Params: { slug: string } }>('/public/:slug', async (request, reply) => {
    try {
      const { slug } = request.params;
      const page = await getHostedPageBySlug(slug);

      if (!page || !page.tenant) {
        return reply.status(404).send({ error: 'Page not found' });
      }

      reply.send({
        id: page.id,
        name: page.name,
        slug: page.slug,
        mode: page.mode,
        fixed_amount: page.fixed_amount,
        allow_custom_amount: page.allow_custom_amount,
        description: page.description,
        tenant: {
          id: page.tenant.id,
          name: page.tenant.name,
          logo_url: page.tenant.logo_url,
          brand_color: page.tenant.brand_color,
        },
      });
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });

  // Payment from hosted page
  app.post<{ Params: { slug: string }; Body: any }>(
    '/public/:slug/checkout',
    async (request, reply) => {
      try {
        const { slug } = request.params;
        const { amount, customer_name, customer_email, customer_phone } = request.body;

        const page = await getHostedPageBySlug(slug);
        if (!page || !page.tenant) {
          return reply.status(404).send({ error: 'Page not found' });
        }

        const finalAmount = page.fixed_amount || amount;
        if (!finalAmount || finalAmount <= 0) {
          return reply.status(400).send({ error: 'Invalid amount' });
        }

        const payment = await createPayment({
          tenantId: page.tenant_id,
          amount: Math.round(finalAmount * 100), // Convert to minor units
          currency: page.tenant.supported_currencies[0] || 'NGN',
          customer: { name: customer_name, email: customer_email, phone: customer_phone },
          metadata: { hosted_page_id: page.id },
          mode: page.mode,
        });

        const flutterResult = await initializePayment(payment, page.tenant);

        reply.status(201).send({
          id: payment.id,
          checkout_url: flutterResult.checkout_url,
          status: payment.status,
        });
      } catch (error: any) {
        app.log.error(error);
        reply.status(400).send({ error: error.message });
      }
    }
  );
}