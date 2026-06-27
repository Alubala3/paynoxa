import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TenantRegisterSchema, UserLoginSchema } from '../utils/validators.js';
import { registerUser, loginUser, hashPassword } from '../modules/auth/auth.service.js';
import { createTenant } from '../modules/tenants/tenant.service.js';
import { BadRequestError } from '../utils/errors.js';

export async function authRoutes(app: FastifyInstance) {
  // Tenant registration (creates tenant + initial user)
  app.post<{ Body: any }>('/register', async (request, reply) => {
    try {
      const data = TenantRegisterSchema.parse(request.body);

      // Create tenant
      const tenant = await createTenant({
        name: data.name,
        type: data.type,
        country: data.country,
        email: data.email,
      });

      // Create owner user
      const user = await registerUser(data.email, data.password, tenant.id);

      // Generate JWT
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        tenant_id: tenant.id,
        role: user.role,
      });

      reply.status(201).send({
        tenant: { id: tenant.id, name: tenant.name },
        user: { id: user.id, email: user.email },
        token,
      });
    } catch (error: any) {
      if (error.statusCode) {
        reply.status(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        reply.status(400).send({ error: error.message });
      }
    }
  });

  // User login
  app.post<{ Body: any }>('/login', async (request, reply) => {
    try {
      const data = UserLoginSchema.parse(request.body);
      const user = await loginUser(data.email, data.password);

      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        tenant_id: user.tenant_id,
        role: user.role,
      });

      reply.send({
        user: { id: user.id, email: user.email, role: user.role },
        tenant_id: user.tenant_id,
        token,
      });
    } catch (error: any) {
      reply.status(error.statusCode || 400).send({
        error: error.message,
        code: error.code || 'AUTH_ERROR',
      });
    }
  });

  // Verify token
  app.get<{}>('/verify', async (request, reply) => {
    try {
      await request.jwtVerify();
      const user = request.user as any;
      reply.send({ valid: true, user });
    } catch (error) {
      reply.status(401).send({ valid: false, error: 'Invalid token' });
    }
  });
}