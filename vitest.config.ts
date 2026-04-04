import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "openclaw/plugin-sdk/core": new URL("./src/__mocks__/openclaw-plugin-sdk.ts", import.meta.url).pathname,
      "openclaw/plugin-sdk/setup": new URL("./src/__mocks__/openclaw-plugin-sdk.ts", import.meta.url).pathname,
      "openclaw/plugin-sdk/channel-runtime": new URL("./src/__mocks__/openclaw-plugin-sdk.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
  },
});
