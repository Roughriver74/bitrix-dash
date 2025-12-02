import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
const dbPath = dbUrl.startsWith('file:') 
  ? path.resolve(process.cwd(), dbUrl.replace('file:', '').replace(/^\/\//, '')) 
  : path.resolve(process.cwd(), 'dev.db');

console.log('🔌 Initializing BetterSqlite3 with path:', dbPath);

const adapter = new PrismaBetterSqlite3({ url: dbPath } as any)

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
