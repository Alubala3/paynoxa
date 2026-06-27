import axios from 'axios';
import { env } from '../../config/env.js';
import { getPaymentByProviderReference, updatePaymentStatus } from '../payments/payments.service.js';
import { PrismaClient } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';

const prisma = new PrismaClient();
const fw = axios.create({
  baseURL: env.FLUTTERWAVE_BASE,
  headers: {
    Authorization: `Bearer ${env.FLUTTERWAVE_SECRET}`,
  },
});

export async function initializePayment(payment: any, tenant: any) {
  const tx_ref = `pn-${payment.id}-${Date.now()}`;

  const payload = {
    tx_ref,
    amount: (payment.amount / 100).toFixed(2), // Convert to decimal
    currency: payment.currency,
    redirect_url: `${env.BACKEND_BASE_URL}/api/flutterwave/callback?tx_ref=${tx_ref}`,
    customer: {
      email: payment.metadata?.email || payment.customer?.email || 'no-reply@paynoxa.local',
      name: payment.metadata?.name || payment.customer?.name || 'Customer',
      phone: payment.customer?.phone,
    },
    customizations: {
      title: tenant.name,
      description: payment.mode === 'donation' ? 'Donation' : 'Payment',
      logo: tenant.logo_url,
    },
  };

  try {
    const response = await fw.post('/payments', payload);
    const { data } = response.data;

    // Update payment with Flutterwave details
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        provider_reference: tx_ref,
        payment_link: data.link,
        provider_response: response.data,
        status: 'pending',
      },
    });

    return {
      checkout_url: data.link,
      tx_ref,
    };
  } catch (error: any) {
    throw new BadRequestError(
      `Failed to initialize Flutterwave payment: ${error.response?.data?.message || error.message}`
    );
  }
}

export async function verifyPayment(tx_ref: string) {
  try {
    const response = await fw.get(`/transactions/${tx_ref}/verify`);
    return response.data.data;
  } catch (error: any) {
    throw new BadRequestError(`Failed to verify payment: ${error.message}`);
  }
}

export async function handleFlutterwaveCallback(tx_ref: string) {
  // Find payment by provider reference
  const payment = await getPaymentByProviderReference(tx_ref);
  if (!payment) {
    throw new NotFoundError('Payment not found');
  }

  // Verify with Flutterwave
  const verification = await verifyPayment(tx_ref);

  const status = verification.status === 'successful' ? 'success' : 'failed';

  // Update payment
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status,
      provider_response: verification,
    },
  });

  // If successful, create ledger entry
  if (status === 'success') {
    await prisma.ledgerEntry.create({
      data: {
        tenant_id: payment.tenant_id,
        payment_id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        direction: 'inbound',
        reference: verification.id?.toString() || tx_ref,
        metadata: { provider: 'flutterwave', verification_id: verification.id },
      },
    });
  }

  return { status, verification };
}