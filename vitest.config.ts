import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@app": path.resolve(__dirname, "src"),
            "@modules": path.resolve(__dirname, "src/modules"),
            "@core": path.resolve(__dirname, "src/core"),
        },
    },
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: [
                "src/modules/payment/**",
                "src/modules/bookings/**",
            ],
        },
    },
});
