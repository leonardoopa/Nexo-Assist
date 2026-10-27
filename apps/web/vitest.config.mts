import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromHere("./src"),
      // `server-only` throws outside the React server bundle; the tests run in plain Node.
      "server-only": fromHere("./src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
