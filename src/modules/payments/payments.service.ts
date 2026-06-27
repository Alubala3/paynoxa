import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { env } from '../../config/env.js';
import { BadRequestError, NotFoundError, ConflictError } from '../../utils/errors.js';

const prisma = new PrismaClient();

export type CreatePaymentInput = {
  tenantId: string;
  amount: number; // integer minor units
  currency: string;
  customer?: { name?: string; email?: string; phone?: string };
  metadata?: Record<string, any>;
  callback_url?: string;
  idempotency_key?: string;
  mode?: 'payment' | 'donation';
};

export async function createPayment(input: CreatePaymentInput) {
  // Validate tenant status
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant || tenant.status !== 'active') {
    throw new BadRequestError('Tenant not active');
  }

  // Validate amount
  if (input.amount <= 0) {
    throw new BadRequestError('Amount must be positive');
  }

  // Idempotency check
  if (input.idempotency_key) {
    const existing = await prisma.payment.findFirst({
      where: {
        tenant_id: input.tenantId,
        idempotency_key: input.idempotency_key,
      },
    });
    if (existing) {
      return existing;
    }
  }

  // Create or find customer
  let customerId = null;
  if (input.customer) {
    const customer = await prisma.customer.create({
      data: {
        tenant_id: input.tenantId,
        name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone,
      },
    });
    customerId = customer.id;
  }

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      tenant_id: input.tenantId,
      customer_id: customerId,
      amount: input.amount,
      currency: input.currency,
      metadata: input.metadata,
      callback_url: input.callback_url,
      idempotency_key: input.idempotency_key,
      mode: input.mode || 'payment',
      status: 'created',
      provider: 'flutterwave',
    },
  });

  return payment;
}

export async function getPayment(id: string, tenantId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      customer: true,
      webhookDeliveries: true,
      ledgerEntries: true,
    },
  });

  if (!payment || payment.tenant_id !== tenantId) {
    throw new NotFoundError('Payment not found');
  }

  return payment;
}

export async function listPayments(
  tenantId: string,
  filters?: { status?: string; mode?: string; skip?: number; take?: number }
) {
  const skip = filters?.skip || 0;
  const take = filters?.take || 50;

  const where: any = { tenant_id: tenantId };
  if (filters?.status) where.status = filters.status;
  if (filters?.mode) where.mode = filters.mode;

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { customer: true },
      orderBy: { created_at: 'desc' },
      skip,
      take,
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, skip, take };
}

export async function updatePaymentStatus(id: string, status: string) {
  // Validate state transition
  const validTransitions: Record<string, string[]> = {
    created: ['pending', 'cancelled'],
    pending: ['success', 'failed', 'cancelled'],
    success: [],
    failed: [],
    cancelled: [],
  };

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new NotFoundError('Payment not found');

  const allowed = validTransitions[payment.status] || [];
  if (!allowed.includes(status)) {
    throw new BadRequestError(
      `Cannot transition from ${payment.status} to ${status}`
    );
  }

  return prisma.payment.update({
    where: { id },
    data: { status },
  });
}

export async function getPaymentByProviderReference(reference: string) {
  return prisma.payment.findUnique({
    where: { provider_reference: reference },
    include: { customer: true, tenant: true },
  });
}