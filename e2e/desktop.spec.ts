import { expect, test } from '@playwright/test';

test('desktop dashboard renders without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('総資産残高').first()).toBeVisible();
  await expect(page.locator('main')).toContainText('¥4,125,921');
  expect(errors).toEqual([]);
});

test('N opens the entry dialog and Escape closes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('総資産残高').first()).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.locator('[role=dialog]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
});

test('the entry dialog stays within the viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('総資産残高').first()).toBeVisible();
  await page.keyboard.press('n');
  const box = await page.locator('[role=dialog] .sheet-card').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThan(0);
  expect(box!.y + box!.height).toBeLessThan(800);
});
