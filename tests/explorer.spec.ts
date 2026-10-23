import { test, expect } from '@playwright/test';

const docs = {
  description: 'Encode and decode data.',
  actions: [
    { name: 'encode', input: 'raw', output: 'raw', default: true, options: {}, credentials: [] },
    { name: 'decode', input: 'text', output: 'buffer', options: { mode: 'Optional decoding mode' }, credentials: [] },
  ],
};

test('catalog, actions, history, copy and responsive layout', async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://*.jsfn.run/api', async (route) => {
    expect(route.request().method()).toBe('OPTIONS');
    await route.fulfill({ json: docs });
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'base64', exact: true })).toBeVisible();
  await expect(page.locator('[data-function]')).toHaveCount(40);
  await page.getByRole('button', { name: 'decode', exact: true }).click();
  await expect(page).toHaveURL(/action=decode/);
  await expect(page.getByText('Optional decoding mode')).toBeVisible();
  await page.getByRole('button', { name: 'Copy endpoint URL' }).click();
  await expect(page.getByText('Copied to clipboard')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://base64.jsfn.run/decode');
  await page.getByRole('searchbox').fill('hash');
  await expect(page.locator('[data-function]')).toHaveCount(2);
  await page.locator('[data-function="hash"]').click();
  await expect(page.getByRole('heading', { name: 'hash', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'decode', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('searchbox').fill('no-such-function');
  await expect(page.getByText('No matches. Try a different search.')).toBeVisible();
  await page.getByRole('searchbox').fill('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/explorer-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('loading, failure, retry, unsafe metadata and empty actions', async ({ page }) => {
  let attempt = 0;
  await page.route('https://*.jsfn.run/api', async (route) => {
    attempt++;
    if (attempt === 1) {
      await route.fulfill({ status: 503, body: 'unavailable' });
      return;
    }
    if (attempt === 2) {
      await route.fulfill({ json: { ...docs, description: '<img src=x onerror=alert(1)>' } });
      return;
    }
    await route.fulfill({ json: { actions: [] } });
  });
  await page.goto('/?fn=base64');
  await expect(page.getByRole('heading', { name: 'Documentation unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry documentation' }).click();
  await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  await expect(page.locator('#detail img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No actions documented' })).toBeVisible();
});

test('stale responses cannot replace the selected function', async ({ page }) => {
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://base64.jsfn.run/api', async (route) => {
    await wait;
    await route.fulfill({ json: docs }).catch(() => {});
  });
  await page.route('https://hash.jsfn.run/api', async (route) => {
    await route.fulfill({ json: docs });
  });
  await page.goto('/?fn=base64');
  await expect(page.getByRole('heading', { name: 'Opening base64…' })).toBeVisible();
  await page.getByRole('searchbox').fill('hash');
  await page.locator('[data-function="hash"]').click();
  await expect(page.getByRole('heading', { name: 'hash', exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'hash', exact: true })).toBeVisible();
});

test('unknown deep links do not fetch arbitrary hosts', async ({ page }) => {
  let fetched = false;
  await page.route('https://*.jsfn.run/api', async (route) => {
    fetched = true;
    await route.abort();
  });
  await page.goto('/?fn=unknown');
  await expect(page.getByRole('heading', { name: 'Function not in this catalog' })).toBeVisible();
  expect(fetched).toBe(false);
});
