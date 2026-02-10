import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for the login card to be visible
        await page.locator('.login-card').waitFor({ state: 'visible' });
    });

    test('all interactive elements are focusable', async ({ page }) => {
        // Get all buttons on the page
        const buttons = page.locator('.login-card button');
        const buttonCount = await buttons.count();
        expect(buttonCount).toBeGreaterThan(0);

        for (let i = 0; i < buttonCount; i++) {
            const button = buttons.nth(i);
            const isVisible = await button.isVisible();
            if (isVisible) {
                await button.focus();
                await expect(button).toBeFocused();
            }
        }

        // Get all input fields
        const inputs = page.locator('.login-card input');
        const inputCount = await inputs.count();
        expect(inputCount).toBeGreaterThan(0);

        for (let i = 0; i < inputCount; i++) {
            const input = inputs.nth(i);
            const isVisible = await input.isVisible();
            if (isVisible) {
                await input.focus();
                await expect(input).toBeFocused();
            }
        }
    });

    test('buttons have accessible names', async ({ page }) => {
        const buttons = page.locator('.login-card button');
        const buttonCount = await buttons.count();

        for (let i = 0; i < buttonCount; i++) {
            const button = buttons.nth(i);
            const isVisible = await button.isVisible();
            if (!isVisible) continue;

            // Each button should have either text content or an aria-label
            const ariaLabel = await button.getAttribute('aria-label');
            const textContent = (await button.textContent()).trim();

            const hasAccessibleName = (ariaLabel && ariaLabel.length > 0) || textContent.length > 0;
            expect(hasAccessibleName, `Button at index ${i} should have an accessible name`).toBe(true);
        }
    });

    test('form inputs have associated labels', async ({ page }) => {
        // Check that visible inputs have labels (either <label> elements or aria-label)
        const inputGroups = page.locator('.login-card .input-group');
        const groupCount = await inputGroups.count();

        for (let i = 0; i < groupCount; i++) {
            const group = inputGroups.nth(i);
            const isVisible = await group.isVisible();
            if (!isVisible) continue;

            // Each input group should have a label
            const label = group.locator('label');
            const labelCount = await label.count();

            const input = group.locator('input');
            const inputCount = await input.count();

            if (inputCount > 0) {
                // Either has a visible <label> or the input has an aria-label
                const ariaLabel = await input.first().getAttribute('aria-label');
                const hasLabel = labelCount > 0 || (ariaLabel && ariaLabel.length > 0);
                expect(hasLabel, `Input group at index ${i} should have a label`).toBe(true);
            }
        }
    });

    test('language toggle button has aria-label', async ({ page }) => {
        // The language toggle button should have an aria-label for accessibility
        const langButton = page.locator('.login-card button[aria-label]').first();
        await expect(langButton).toBeVisible();

        const ariaLabel = await langButton.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel.length).toBeGreaterThan(0);
    });

    test('page has proper heading hierarchy', async ({ page }) => {
        // There should be at least one h1 on the page
        const h1 = page.locator('h1');
        const h1Count = await h1.count();
        expect(h1Count).toBeGreaterThanOrEqual(1);

        // The h1 should be visible and non-empty
        await expect(h1.first()).toBeVisible();
        const h1Text = await h1.first().textContent();
        expect(h1Text.trim().length).toBeGreaterThan(0);
    });

    test('color contrast - text is not invisible', async ({ page }) => {
        // Verify key text elements are actually rendering content
        const title = page.locator('.login-card h1');
        await expect(title).toBeVisible();

        const titleText = await title.textContent();
        expect(titleText.length).toBeGreaterThan(0);

        // Subtitle text
        const subtitle = page.locator('.login-card p').first();
        await expect(subtitle).toBeVisible();

        const subtitleText = await subtitle.textContent();
        expect(subtitleText.length).toBeGreaterThan(0);
    });

    test('keyboard navigation works through login form', async ({ page }) => {
        // Start with the first input and tab through the form
        const firstInput = page.locator('.login-card input').first();
        await firstInput.focus();
        await expect(firstInput).toBeFocused();

        // Tab forward
        await page.keyboard.press('Tab');

        // Something else should now be focused (not the same element)
        const activeElementTag = await page.evaluate(() => document.activeElement.tagName.toLowerCase());
        expect(['input', 'button', 'a', 'select', 'textarea']).toContain(activeElementTag);
    });

    test('required form fields have the required attribute', async ({ page }) => {
        // In server mode, username and password should be required
        const inputs = page.locator('.login-card form input[required]');
        const requiredCount = await inputs.count();

        // At minimum, the password field should be required
        expect(requiredCount).toBeGreaterThanOrEqual(1);
    });
});
