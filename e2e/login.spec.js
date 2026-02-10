import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('page loads and shows login form', async ({ page }) => {
        // The login card should be visible
        const loginCard = page.locator('.login-card');
        await expect(loginCard).toBeVisible();

        // Title should be present
        const title = page.locator('h1');
        await expect(title).toBeVisible();
        await expect(title).not.toBeEmpty();
    });

    test('login form has username, password fields and submit button', async ({ page }) => {
        // In server mode (default), username and password fields should be visible
        const usernameInput = page.locator('input[type="text"]').first();
        await expect(usernameInput).toBeVisible();

        const passwordInput = page.locator('input[type="password"]').first();
        await expect(passwordInput).toBeVisible();

        // Submit button should be present
        const submitButton = page.locator('.login-card button.btn-primary').first();
        await expect(submitButton).toBeVisible();
        await expect(submitButton).toBeEnabled();
    });

    test('username field has default value of admin', async ({ page }) => {
        const usernameInput = page.locator('input[type="text"]').first();
        await expect(usernameInput).toHaveValue('admin');
    });

    test('language toggle cycles through languages', async ({ page }) => {
        // Find the language toggle button (has aria-label containing "Switch" or similar)
        const langButton = page.locator('.login-card button[aria-label]').first();
        await expect(langButton).toBeVisible();

        // Get initial language text
        const initialText = await langButton.locator('span').textContent();

        // Click to cycle language
        await langButton.click();
        const secondText = await langButton.locator('span').textContent();

        // The language text should have changed
        expect(secondText).not.toBe(initialText);

        // Click again to cycle further
        await langButton.click();
        const thirdText = await langButton.locator('span').textContent();
        expect(thirdText).not.toBe(secondText);
    });

    test('switching to client mode shows token input', async ({ page }) => {
        // Find and click the client mode tab button
        // The login tab buttons are in the tab bar area
        const tabButtons = page.locator('.login-card .btn');
        const clientModeTab = tabButtons.nth(1);
        await clientModeTab.click();

        // In client mode, there should be a password input for the token
        const tokenInput = page.locator('input[type="password"]').first();
        await expect(tokenInput).toBeVisible();
    });

    test('remember me checkbox is present and toggleable', async ({ page }) => {
        const checkbox = page.locator('input[type="checkbox"]#remember');
        await expect(checkbox).toBeVisible();
        await expect(checkbox).not.toBeChecked();

        // Toggle it
        await checkbox.check();
        await expect(checkbox).toBeChecked();

        // Toggle back
        await checkbox.uncheck();
        await expect(checkbox).not.toBeChecked();
    });

    test('form submission shows error when API is unavailable', async ({ page }) => {
        // Fill in the password field
        const passwordInput = page.locator('input[type="password"]').first();
        await passwordInput.fill('testpassword');

        // Submit the form using keyboard Enter on the password field
        // This is more reliable than clicking the button for form submission
        await passwordInput.press('Enter');

        // The app should attempt to hash the password and call /api/login.
        // Without a backend, it will show an error message. Wait for the error.
        const errorMessage = page.locator('.login-card').locator('p[style*="color: var(--error)"]');
        await expect(errorMessage).toBeVisible({ timeout: 10000 });
    });

    test('security badges are shown below the form', async ({ page }) => {
        // SecurityBadges component should render below the login form
        const loginCard = page.locator('.login-card');
        await expect(loginCard).toBeVisible();

        // There should be some content below the form (security badges area)
        const badgesArea = loginCard.locator('div').last();
        await expect(badgesArea).toBeVisible();
    });
});
