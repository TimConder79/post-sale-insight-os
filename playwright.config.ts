import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: [
    {
      command: "npm run start",
      url: "http://127.0.0.1:3101/api/status",
      reuseExistingServer: false,
      env: {
        PORT: "3101",
        AI_MODE: "stub",
        WORKSPACE_USER_ID: "11111111-1111-4111-8111-111111111111",
      },
    },
    {
      command: "npm run start",
      url: "http://127.0.0.1:3102/api/status",
      reuseExistingServer: false,
      env: {
        PORT: "3102",
        AI_MODE: "unavailable",
        WORKSPACE_USER_ID: "22222222-2222-4222-8222-222222222222",
      },
    },
  ],
});
