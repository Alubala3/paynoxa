import { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

const prisma = new PrismaClient();

export async function createTenant(data: {
  name: string;
  type: string;
  country: string;
  email: string;
}) {
  const existing = await prisma.tenant.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  return prisma.tenant.create({
    data: {
      ...data,
      status: 'active', // Can be changed to 'pending' if email verification required
    },
  });
}

export async function getTenant(id: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  return tenant;
}

export async function updateTenant(id: string, data: any) {
  return prisma.tenant.update({
    where: { id },
    data,
  });
}

export async function suspendTenant(id: string) {
  return prisma.tenant.update({
    where: { id },
    data: { status: 'suspended' },
  });
}

export async function activateTenant(id: string) {
  return prisma.tenant.update({
    where: { id },
    data: { status: 'active' },
  });
}

export async function listTenants(skip: number = 0, take: number = 50) {
  return prisma.tenant.findMany({
    skip,
    take,
    orderBy: { created_at: 'desc' },
  });
}