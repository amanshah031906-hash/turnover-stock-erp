// Reuses one Prisma Client across hot reloads in dev so we don't exhaust
// Neon's connection limit by creating a new client on every file save.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
