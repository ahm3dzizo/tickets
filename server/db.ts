import 'dotenv/config';
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default prisma;

// Helper to check if a Prisma model exists
export function prismaModelExists(modelName: string): boolean {
  try {
    return (prisma as any)[modelName] !== undefined;
  } catch {
    return false;
  }
}
