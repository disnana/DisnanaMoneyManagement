import { expect, test } from '@playwright/test';

const theme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

test.describe('theme: auto by default, manually overridable', () => {
  test('auto follows the OS and updates live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    expect(await theme(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => theme(page)).toBe('dark');
  });

  test('manual choice wins over the OS and survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByText('総資産残高').first()).toBeVisible();
    await page.getByRole('tab', { name: 'ライト' }).click();
    expect(await theme(page)).toBe('light');
    await page.reload();
    expect(await theme(page)).toBe('light');
    // back to auto: follows the OS again (dark)
    await page.getByRole('tab', { name: '自動' }).click();
    expect(await theme(page)).toBe('dark');
    expect(await page.evaluate(() => localStorage.getItem('dmm_theme'))).toBeNull();
  });

  test('dark actually restyles the page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'ダーク' }).click();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(0, 0, 0)');
    await page.getByRole('tab', { name: 'ライト' }).click();
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(light).not.toBe('rgb(0, 0, 0)');
  });
});
