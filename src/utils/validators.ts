import { z } from 'zod';

export const TenantRegisterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['business', 'ngo']),
  country: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const UserLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const PaymentCreateSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  customer: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
  callback_url: z.string().url().optional(),
  idempotency_key: z.string().optional(),
  mode: z.enum(['payment', 'donation']).optional(),
});

export const HostedPageCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  fixed_amount: z.number().int().optional(),
  allow_custom_amount: z.boolean().optional(),
  mode: z.enum(['payment', 'donation']),
  description: z.string().optional(),
  success_url: z.string().url().optional(),
  failure_url: z.string().url().optional(),
});

export const WebhookEndpointSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(32),
});