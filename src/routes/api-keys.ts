import { FastifyInstance } from 'fastify';
import { createApiKey, listApiKeys, revokeApiKey } from '../modules/api-keys/api-key.service.js';
import { resolveTenant } from '../middleware/auth.js';

export async function apiKeyRoutes(app: FastifyInstance) {
  // Create API key pair
  app.post<{ Body: any }>('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const tenantId = await resolveTenant(request);
      const { mode } = request.body;

      if (!['test', 'live'].includes(mode)) {
        return reply.status(400).send({ error: 'Invalid mode' });
      }

      const pk = await createApiKey(tenantId, mode, 'pk');
      const sk = await createApiKey(tenantId, mode, 'sk');

      reply.status(201).send({
        public_key: pk,
        secret_key: sk,
        warning: 'Save your secret key somewhere safe. You will not be able to see it again.',
      });
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });

  // List API keys
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    try {
      const tenantId = await resolveTenant(request);
      const keys = await listApiKeys(tenantId);
      reply.send(keys);
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });

  // Revoke API key
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      try {
        const tenantId = await resolveTenant(request);
        const { id } = request.params;

        // Verify ownership
        const key = await app.prisma.apiKey.findUnique({ where: { id } });
        if (!key || key.tenant_id !== tenantId) {
          return reply.status(403).send({ error: 'Forbidden' });
        }

        await revokeApiKey(key.key_id);
        reply.send({ success: true });
      } catch (error: any) {
        reply.status(400).send({ error: error.message });
      }
    }
  );
}