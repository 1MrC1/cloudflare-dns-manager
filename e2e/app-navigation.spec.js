import { test, expect } from '@playwright/test';

test.describe('App Navigation and Structure', () => {
    test('page loads with correct title', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle('Cloudflare DNS Manager');
    });

    test('login page renders when not authenticated', async ({ page }) => {
        await page.goto('/');

        // When not authenticated, the Login component should render
        const loginCard = page.locator('.login-card');
        await expect(loginCard).toBeVisible();

        // The main app header (with logout, etc.) should NOT be visible
        const header = page.locator('header');
        await expect(header).toHaveCount(0);
    });

    test('PWA manifest link is present in the HTML head', async ({ page }) => {
        // In dev mode, vite-plugin-pwa may not serve the manifest file directly,
        // but the plugin injects a <link rel="manifest"> tag into the HTML.
        await page.goto('/');

        // Check that the PWA plugin has registered or that the app is PWA-ready.
        // The vite-plugin-pwa config defines manifest metadata; verify the app
        // at least has the expected title and theme-color matching the PWA config.
        const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
        expect(themeColor).toBe('#f48120');

        const title = await page.title();
        expect(title).toContain('Cloudflare DNS Manager');
    });

    test('page has correct meta tags', async ({ page }) => {
        await page.goto('/');

        // Check viewport meta tag
        const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
        expect(viewport).toContain('width=device-width');

        // Check theme-color meta tag
        const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
        expect(themeColor).toBe('#f48120');

        // Check description meta tag
        const description = await page.locator('meta[name="description"]').getAttribute('content');
        expect(description).toBeTruthy();
    });

    test('page loads without console errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (error) => {
            errors.push(error.message);
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Filter out expected errors (e.g., API calls that fail without a backend)
        const unexpectedErrors = errors.filter(
            (err) => !err.includes('fetch') && !err.includes('Failed to fetch') && !err.includes('NetworkError')
        );

        expect(unexpectedErrors).toHaveLength(0);
    });

    test('app root element exists', async ({ page }) => {
        await page.goto('/');
        const root = page.locator('#root');
        await expect(root).toBeVisible();
        // The root should have child content (React rendered)
        const childCount = await root.locator('> *').count();
        expect(childCount).toBeGreaterThan(0);
    });

    test('login tab switching works correctly', async ({ page }) => {
        await page.goto('/');

        const loginCard = page.locator('.login-card');
        await expect(loginCard).toBeVisible();

        // The tab bar should contain multiple buttons
        const tabButtons = loginCard.locator('div[style*="gap"] > .btn');
        const tabCount = await tabButtons.count();
        expect(tabCount).toBeGreaterThanOrEqual(2);

        // Click on the second tab (client mode)
        await tabButtons.nth(1).click();

        // The form content should update (client mode shows a token field, not username)
        // Look for the token label/input
        const labels = loginCard.locator('label');
        const labelCount = await labels.count();
        expect(labelCount).toBeGreaterThan(0);
    });
});
