import { expect, test } from '@playwright/test';
import { abortNextFinanceWrite } from './abortFinanceWrite';

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

test('a failed backup restore keeps the existing ledger and can retry the selected file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'データ管理・バックアップ' }).click();
  await abortNextFinanceWrite(page);
  const backup = {
    accounts: [{ id: 'restore-bank', name: '復元口座', type: 'bank', initialBalance: 17235 }],
    transactions: [], budgets: [], recurringItems: [], savingsGoals: [],
  };
  await page.locator('input[type=file]').setInputFiles({
    name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  });
  const failure = page.getByRole('alertdialog');
  await expect(failure).toContainText('保存できませんでした');
  await page.keyboard.press('Escape');
  await expect(failure).toHaveCount(0);
  await expect(page.locator('main')).toContainText('¥4,125,921');

  await page.getByRole('button', { name: '復元を再試行' }).click();
  await expect(page.getByRole('dialog')).toContainText('バックアップからデータを復元しました');
  await page.reload();
  await expect(page.locator('main')).toContainText('¥17,235');
  expect(errors).toEqual([]);
});
