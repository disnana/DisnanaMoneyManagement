import { expect, test } from '@playwright/test';

test('a stale tab keeps its draft and can record it against the latest balance', async ({ context, page }) => {
  await page.addInitScript(() => localStorage.setItem('kakeibo_finance_state_v2', JSON.stringify({
    accounts: [{ id: 'cash', name: '財布', type: 'cash', initialBalance: 10000 }],
    transactions: [], budgets: [], recurringItems: [], savingsGoals: [],
  })));
  await page.goto('/');
  await expect(page.locator('main')).toContainText('¥10,000');

  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('main')).toContainText('¥10,000');
  await second.keyboard.press('n');
  await second.locator('#tx-amount').fill('200');

  await page.keyboard.press('n');
  await page.locator('#tx-amount').fill('100');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.locator('main')).toContainText('¥9,900');

  await second.getByRole('button', { name: '登録', exact: true }).click();
  const warning = second.getByRole('alertdialog');
  await expect(warning).toContainText('最新の内容を確認');
  await warning.getByRole('button', { name: '閉じる' }).click();
  await expect(second.locator('#tx-amount')).toHaveValue('200');
  await second.getByRole('button', { name: '登録', exact: true }).click();
  await expect(second.locator('main')).toContainText('¥9,700');

  await page.reload();
  await expect(page.locator('main')).toContainText('¥9,700');
});
