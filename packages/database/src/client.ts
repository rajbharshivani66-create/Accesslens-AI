import { PrismaClient } from '@prisma/client';

const prismaGlobal = globalThis as typeof globalThis & {
  accessLensPrisma?: PrismaClient;
};

export const prisma =
  prismaGlobal.accessLensPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  prismaGlobal.accessLensPrisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
  } catch (error) {
    console.error('Unable to connect to the configured PostgreSQL database.', {
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
