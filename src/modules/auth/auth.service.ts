import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { BadRequestError, ConflictError } from '../../utils/errors.js';

const prisma = new PrismaClient();

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  passwordHash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch (err) {
    return false;
  }
}

export async function registerUser(
  email: string,
  password: string,
  tenantId?: string
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      password_hash: passwordHash,
      tenant_id: tenantId,
      role: tenantId ? 'admin' : 'owner',
    },
  });

  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new BadRequestError('Invalid email or password');
  }

  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    throw new BadRequestError('Invalid email or password');
  }

  return user;
}