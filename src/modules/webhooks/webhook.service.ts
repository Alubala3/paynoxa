import crypto from 'crypto';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../../config/env.js';
import { NotFoundError } from '../../utils/errors.js';

const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL);

const webhookQueue = new Queue('webhooks', { connection: redis });

export function signWebhook(secret: string, payload: Record<string, any>): string {
  const body = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export async function createWebhookEndpoint(tenantId: string, url: string, secret: string) {
  return prisma.webhookEndpoint.create({
    data: {
      tenant_id: tenantId,
      url,
      secret,
      enabled: true,
    },
  });
}

export async function getWebhookEndpoints(tenantId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { tenant_id: tenantId },
    select: {
      id: true,
      url: true,
      enabled: true,
      created_at: true,
      updated_at: true,
    },
  });
}

export async function updateWebhookEndpoint(
  id: string,
  tenantId: string,
  data: { url?: string; enabled?: boolean }
) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint || endpoint.tenant_id !== tenantId) {
    throw new NotFoundError('Webhook endpoint not found');
  }

  return prisma.webhookEndpoint.update({
    where: { id },
    data,
  });
}

export async function deleteWebhookEndpoint(id: string, tenantId: string) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint || endpoint.tenant_id !== tenantId) {
    throw new NotFoundError('Webhook endpoint not found');
  }

  return prisma.webhookEndpoint.delete({ where: { id } });
}

export async function getWebhookDeliveries(
  endpointId: string,
  tenantId: string,
  skip: number = 0,
  take: number = 50
) {
  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: endpointId },
  });

  if (!endpoint || endpoint.tenant_id !== tenantId) {
    throw new NotFoundError('Webhook endpoint not found');
  }

  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where: { webhookEndpoint_id: endpointId },
      include: { payment: true },
      orderBy: { created_at: 'desc' },
      skip,
      take,
    }),
    prisma.webhookDelivery.count({ where: { webhookEndpoint_id: endpointId } }),
  ]);

  return { deliveries, total };
}

export async function enqueueWebhookDelivery(
  endpointId: string,
  paymentId: string,
  eventType: string
) {
  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: endpointId },
  });

  if (!endpoint || !endpoint.enabled) {
    return;
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { customer: true },
  });

  if (!payment) return;

  const payload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data: {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      customer: payment.customer,
      metadata: payment.metadata,
    },
  };

  // Create delivery record
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookEndpoint_id: endpointId,
      payment_id: paymentId,
      event_type: eventType,
      payload,
    },
  });

  // Enqueue for processing
  await webhookQueue.add(`deliver-webhook`, {
    deliveryId: delivery.id,
    endpointId,
    payload,
    url: endpoint.url,
    secret: endpoint.secret,
  });
}

export async function retryFailedDeliveries() {
  const failed = await prisma.webhookDelivery.findMany({
    where: {
      attempts: { lt: 5 },
      last_attempt_at: null,
    },
    include: { webhookEndpoint: true },
    take: 100,
  });

  for (const delivery of failed) {
    if (!delivery.webhookEndpoint) continue;

    await webhookQueue.add(`deliver-webhook`, {
      deliveryId: delivery.id,
      endpointId: delivery.webhookEndpoint.id,
      payload: delivery.payload,
      url: delivery.webhookEndpoint.url,
      secret: delivery.webhookEndpoint.secret,
    });
  }
}

// Webhook worker
export function setupWebhookWorker() {
  const worker = new Worker(
    'webhooks',
    async (job) => {
      const { deliveryId, payload, url, secret } = job.data;

      try {
        const signature = signWebhook(secret, payload);
        const headers = {
          'Content-Type': 'application/json',
          'X-Paynoxa-Signature': signature,
          'X-Paynoxa-Timestamp': new Date().toISOString(),
        };

        const response = await axios.post(url, payload, {
          headers,
          timeout: 10000,
        });

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            response_code: response.status,
            response_body: JSON.stringify(response.data).slice(0, 2000),
            attempts: { increment: 1 },
            last_attempt_at: new Date(),
          },
        });

        return { success: true, status: response.status };
      } catch (error: any) {
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            response_code: error.response?.status || 0,
            response_body: (error.response?.data ? JSON.stringify(error.response.data) : error.message).slice(0, 2000),
            attempts: { increment: 1 },
            last_attempt_at: new Date(),
            next_retry_at: new Date(Date.now() + 60000), // Retry in 1 minute
          },
        });

        throw error;
      }
    },
    { connection: redis, maxStalledCount: 2, stalledInterval: 30000 }
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
  });

  return worker;
}