import { test, expect } from '@playwright/test';

test('live documentation works without executing functions', async ({ page }) => {
  test.skip(!process.env.LIVE_API, 'Opt in with LIVE_API=1 to check deployed documentation.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.goto('/?fn=base64');
  await expect(page.getByText('Live documentation', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'decode', exact: true }).click();
  await expect(page.getByText('Decoded binary bytes.')).toBeVisible();
  await page.getByRole('searchbox').fill('hash');
  await page.locator('[data-function="hash"]').click();
  await expect(page.getByText('Live documentation', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('a valid Node.js hash algorithm, like sha256')).toBeVisible();
  expect(errors).toEqual([]);
});
