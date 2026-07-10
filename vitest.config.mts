import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            "obsidian": fileURLToPath(new URL("./src/test/obsidian-stub.ts", import.meta.url)),
        },
    },
    test: {
        testTimeout: 5000,
        environment: "jsdom",
        include: ["src/**/*-test.ts", "src/**/*-test.js"],
    },
});
