import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { env } from '../../config/env.js';

export async function generateApiKeyPair(tenantId: string, mode: 'test' | 'live') {
  const prisma = new PrismaClient();

  const pkResult = await createApiKey(tenantId, mode, 'pk');
  const skResult = await createApiKey(tenantId, mode, 'sk');

  await prisma.$disconnect();

  return {
    public_key: pkResult.raw,
    secret_key: skResult.raw,
  };
}

export async function createApiKey(
  tenantId: string,
  mode: 'test' | 'live',
  type: 'pk' | 'sk'
) {
  const prisma = new PrismaClient();

  const prefix = type === 'pk' ? 'pk' : 'sk';
  const idPart = randomBytes(12).toString('hex').slice(0, 16);
  const keyId = `pn_${mode}_${type}_${idPart}`;
  const secret = randomBytes(32).toString('hex');
  const raw = `${keyId}.${secret}`;

  // Hash secret with pepper
  const pepper = env.ARGON2_PEPPER;
  const secretToHash = secret + pepper;
  const secretHash = await argon2.hash(secretToHash, {
    type: argon2.argon2id,
  });

  const created = await prisma.apiKey.create({
    data: {
      tenant_id: tenantId,
      key_id: keyId,
      secret_hash: secretHash,
      mode,
      type,
      prefix,
    },
  });

  await prisma.$disconnect();

  return {
    id: created.id,
    key_id: keyId,
    raw, // Only show once
    prefix,
    mode,
    type,
  };
}

export async function verifyApiKeySecret(
  secretHash: string,
  secret: string
): Promise<boolean> {
  const pepper = env.ARGON2_PEPPER;
  const secretToVerify = secret + pepper;

  try {
    return await argon2.verify(secretHash, secretToVerify);
  } catch (err) {
    return false;
  }
}

export async function revokeApiKey(keyId: string) {
  const prisma = new PrismaClient();
  const updated = await prisma.apiKey.update({
    where: { key_id: keyId },
    data: { revoked: true },
  });
  await prisma.$disconnect();
  return updated;
}

export async function listApiKeys(tenantId: string) {
  const prisma = new PrismaClient();
  const keys = await prisma.apiKey.findMany({
    where: { tenant_id: tenantId, revoked: false },
    select: {
      id: true,
      key_id: true,
      prefix: true,
      mode: true,
      type: true,
      created_at: true,
    },
  });
  await prisma.$disconnect();
  return keys;
}