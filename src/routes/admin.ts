import { FastifyInstance } from 'fastify';
import {
  listTenants,
  getTenant,
  suspendTenant,
  activateTenant,
} from '../modules/tenants/tenant.service.js';

// Simple admin auth check (in production, use proper admin role verification)
async function requireAdmin(request: any, reply: any) {
  try {
    await request.jwtVerify();
    const user = request.user as any;
    if (user.role !== 'admin') {
      reply.status(403).send({ error: 'Not an admin' });
    }
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

export async function adminRoutes(app: FastifyInstance) {
  // List all tenants
  app.get('/tenants', { onRequest: [requireAdmin] }, async (request, reply) => {
    try {
      const query = request.query as any;
      const tenants = await listTenants(
        parseInt(query.skip || '0'),
        parseInt(query.take || '50')
      );
      reply.send(tenants);
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });

  // Get tenant details
  app.get<{ Params: { id: string } }>(
    '/tenants/:id',
    { onRequest: [requireAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const tenant = await getTenant(id);
        reply.send(tenant);
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );

  // Suspend tenant
  app.post<{ Params: { id: string } }>(
    '/tenants/:id/suspend',
    { onRequest: [requireAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const tenant = await suspendTenant(id);
        reply.send({ success: true, tenant });
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );

  // Activate tenant
  app.post<{ Params: { id: string } }>(
    '/tenants/:id/activate',
    { onRequest: [requireAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const tenant = await activateTenant(id);
        reply.send({ success: true, tenant });
      } catch (error: any) {
        reply.status(error.statusCode || 400).send({ error: error.message });
      }
    }
  );

  // List all payments (across tenants)
  app.get(
    '/payments',
    { onRequest: [requireAdmin] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const payments = await app.prisma.payment.findMany({
          include: { customer: true, tenant: true },
          orderBy: { created_at: 'desc' },
          skip: parseInt(query.skip || '0'),
          take: parseInt(query.take || '50'),
        });

        const total = await app.prisma.payment.count();
        reply.send({ payments, total });
      } catch (error: any) {
        reply.status(400).send({ error: error.message });
      }
    }
  );

  // Get failed payments
  app.get(
    '/payments/failed',
    { onRequest: [requireAdmin] },
    async (request, reply) => {
      try {
        const payments = await app.prisma.payment.findMany({
          where: { status: 'failed' },
          include: { customer: true, tenant: true },
          orderBy: { created_at: 'desc' },
          take: 100,
        });

        reply.send(payments);
      } catch (error: any) {
        reply.status(400).send({ error: error.message });
      }
    }
  );
}