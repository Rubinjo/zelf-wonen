import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });
config();

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "tsx prisma/seed.ts",
    },
    datasource: {
        // The fallback lets `prisma generate` run in CI without opening a connection.
        url:
            process.env.DATABASE_URL ??
            "postgresql://houser:houser_dev_password@localhost:5432/houser?schema=public",
    },
});
