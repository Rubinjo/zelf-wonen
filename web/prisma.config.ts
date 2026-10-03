import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });
config();

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: {
        // The fallback lets `prisma generate` run in CI without opening a connection.
        url:
            process.env.DATABASE_URL ??
            "postgresql://zelfwonen:zelfwonen_dev_password@localhost:5432/zelfwonen?schema=public",
    },
});
