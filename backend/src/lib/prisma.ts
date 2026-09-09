import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

// Prisma 7 talks to MySQL through a driver adapter; the connection string is
// no longer part of schema.prisma. Neither the adapter nor the client opens a
// connection here — the pool is created on the first query, which keeps this
// module importable (and mockable) without a database.
const adapter = new PrismaMariaDb(env.DATABASE_URL);

export const prisma = new PrismaClient({ adapter });

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
