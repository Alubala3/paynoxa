import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function registerAuthHooks(app: FastifyInstance) {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
  });
}

export async function resolveTenant(request: FastifyRequest) {
  const user = request.user as any;
  if (!user?.sub) {
    throw new Error('User not authenticated');
  }
  return user.tenant_id;
}

export async function resolveApiKeyTenant(
  request: FastifyRequest,
  prisma: any
) {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const keyWithSecret = auth.replace('Bearer ', '');
  const [keyId, secret] = keyWithSecret.split('.', 2);

  if (!keyId || !secret) {
    throw new Error('Invalid API key format');
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { key_id: keyId },
    include: { tenant: true },
  });

  if (!apiKey || apiKey.revoked) {
    throw new Error('API key not found or revoked');
  }

  // Verify secret (simplified for now; use argon2 in production)
  const { verifyApiKeySecret } = await import('../modules/api-keys/api-key.service.js');
  const valid = await verifyApiKeySecret(apiKey.secret_hash, secret);
  if (!valid) {
    throw new Error('Invalid API key secret');
  }

  return { apiKey, tenant: apiKey.tenant };
}