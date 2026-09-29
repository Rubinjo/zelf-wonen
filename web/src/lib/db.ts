import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient() {
    const connectionString =
        process.env.DATABASE_URL ??
        "postgresql://zelfwonen:zelfwonen_dev_password@localhost:5432/zelfwonen?schema=public";

    return new PrismaClient({
        adapter: new PrismaPg(connectionString),
    });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = db;
}
