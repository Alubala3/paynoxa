import { PrismaClient } from '@prisma/client';
import { env } from '../../config/env.js';

const prisma = new PrismaClient();

interface EmailProvider {
  send(to: string, subject: string, html: string): Promise<void>;
}

class MockEmailProvider implements EmailProvider {
  async send(to: string, subject: string, html: string): Promise<void> {
    console.log(`[MOCK EMAIL] To: ${to}`);
    console.log(`[MOCK EMAIL] Subject: ${subject}`);
    console.log(`[MOCK EMAIL] Body:\n${html}\n`);
  }
}

function getEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === 'sendgrid' && env.SENDGRID_API_KEY) {
    // TODO: Implement SendGrid provider
    return new MockEmailProvider();
  }
  return new MockEmailProvider();
}

export async function sendReceipt(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { customer: true, tenant: true },
  });

  if (!payment) {
    throw new Error('Payment not found');
  }

  const customerEmail = payment.customer?.email || payment.metadata?.email;
  if (!customerEmail) {
    console.warn(`No email found for payment ${paymentId}`);
    return;
  }

  const html = generateReceiptHtml({
    tenantName: payment.tenant.name,
    customerName: payment.customer?.name || payment.metadata?.name || 'Customer',
    amount: (payment.amount / 100).toFixed(2),
    currency: payment.currency,
    transactionId: payment.id,
    date: new Date(payment.created_at).toLocaleDateString(),
    status: payment.status,
  });

  const provider = getEmailProvider();
  await provider.send(
    customerEmail,
    `Payment Receipt - ${payment.tenant.name}`,
    html
  );

  // Record receipt
  const receipt = await prisma.receipt.create({
    data: {
      tenant_id: payment.tenant_id,
      payment_id: paymentId,
      sent_to: customerEmail,
      content: { html },
    },
  });

  return receipt;
}

function generateReceiptHtml(data: {
  tenantName: string;
  customerName: string;
  amount: string;
  currency: string;
  transactionId: string;
  date: string;
  status: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .details { margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .amount { font-size: 24px; font-weight: bold; color: #4CAF50; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Payment Receipt</h2>
      <p>Thank you for your payment to <strong>${data.tenantName}</strong></p>
    </div>
    <div class="details">
      <div class="row">
        <span>Recipient</span>
        <span>${data.tenantName}</span>
      </div>
      <div class="row">
        <span>Amount</span>
        <span class="amount">${data.amount} ${data.currency}</span>
      </div>
      <div class="row">
        <span>Transaction ID</span>
        <span>${data.transactionId}</span>
      </div>
      <div class="row">
        <span>Date</span>
        <span>${data.date}</span>
      </div>
      <div class="row">
        <span>Status</span>
        <span>${data.status}</span>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}