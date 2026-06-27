import { FastifyInstance } from 'fastify';
import { getTenant, updateTenant } from '../modules/tenants/tenant.service.js';
import { resolveTenant } from '../middleware/auth.js';

export async function tenantRoutes(app: FastifyInstance) {
  // Get current tenant profile
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const tenantId = await resolveTenant(request);
      const tenant = await getTenant(tenantId);
      reply.send(tenant);
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });

  // Update tenant profile
  app.patch('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const tenantId = await resolveTenant(request);
      const body = request.body as any;

      const updated = await updateTenant(tenantId, {
        name: body.name,
        logo_url: body.logo_url,
        brand_color: body.brand_color,
      });

      reply.send(updated);
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });
}