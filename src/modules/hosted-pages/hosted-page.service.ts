import { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

const prisma = new PrismaClient();

export async function createHostedPage(tenantId: string, data: {
  name: string;
  slug: string;
  fixed_amount?: number;
  allow_custom_amount?: boolean;
  mode: 'payment' | 'donation';
  description?: string;
  success_url?: string;
  failure_url?: string;
}) {
  const existing = await prisma.hostedPage.findUnique({
    where: { slug: data.slug },
  });

  if (existing) {
    throw new ConflictError('Slug already in use');
  }

  return prisma.hostedPage.create({
    data: {
      tenant_id: tenantId,
      ...data,
    },
  });
}

export async function getHostedPageBySlug(slug: string) {
  return prisma.hostedPage.findUnique({
    where: { slug },
    include: { tenant: true },
  });
}

export async function getHostedPage(id: string, tenantId: string) {
  const page = await prisma.hostedPage.findUnique({
    where: { id },
    include: { tenant: true },
  });

  if (!page || page.tenant_id !== tenantId) {
    throw new NotFoundError('Hosted page not found');
  }

  return page;
}

export async function listHostedPages(tenantId: string) {
  return prisma.hostedPage.findMany({
    where: { tenant_id: tenantId },
    orderBy: { created_at: 'desc' },
  });
}

export async function updateHostedPage(id: string, tenantId: string, data: any) {
  const page = await prisma.hostedPage.findUnique({ where: { id } });

  if (!page || page.tenant_id !== tenantId) {
    throw new NotFoundError('Hosted page not found');
  }

  return prisma.hostedPage.update({
    where: { id },
    data,
  });
}

export async function deleteHostedPage(id: string, tenantId: string) {
  const page = await prisma.hostedPage.findUnique({ where: { id } });

  if (!page || page.tenant_id !== tenantId) {
    throw new NotFoundError('Hosted page not found');
  }

  return prisma.hostedPage.delete({ where: { id } });
}