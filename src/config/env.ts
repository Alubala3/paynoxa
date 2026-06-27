import dotenv from 'dotenv';

dotenv.config();

export const env = {
  // App
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000'),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '24h',
  ARGON2_PEPPER: process.env.ARGON2_PEPPER || '',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Flutterwave
  FLUTTERWAVE_SECRET: process.env.FLUTTERWAVE_SECRET || '',
  FLUTTERWAVE_PUBLIC_KEY: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
  FLUTTERWAVE_BASE: process.env.FLUTTERWAVE_BASE || 'https://api.flutterwave.com/v3',

  // URLs
  BACKEND_BASE_URL: process.env.BACKEND_BASE_URL || 'http://localhost:4000',
  FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || 'http://localhost:3000',

  // Email
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'mock',
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
};

export function validateEnv() {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'FLUTTERWAVE_SECRET', 'FLUTTERWAVE_PUBLIC_KEY'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
}