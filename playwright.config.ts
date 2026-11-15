import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke suite. Runs on demand (`npm run test:e2e`) — deliberately not
 * part of the git hooks: minutes, not seconds. The web server is the dev
 * bundle; production-build smoke stays a manual `vite preview` pass.
 */
export default defineConfig({
    testDir: "./tests",
    timeout: 30_000,
    fullyParallel: false,
    workers: 1,
    retries: 1,
    reporter: [["list"]],
    use: {
        baseURL: "http://localhost:5183",
        trace: "retry-with-trace",
        screenshot: "only-on-failure",
        viewport: { width: 1658, height: 1304 },
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        command: "npm run dev -- --port 5183 --strictPort",
        url: "http://localhost:5183",
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
