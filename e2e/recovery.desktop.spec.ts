import { expect, test } from '@playwright/test';
import { abortNextFinanceWrite } from './abortFinanceWrite';

test('protects an unreadable ledger until a confirmed backup commits', async ({ page }) => {
  const damaged = '{"transactions":';
  const ledger = {
    accounts: [{ id: 'wallet', name: '復元した財布', type: 'cash', initialBalance: 32100 }],
    transactions: [], budgets: [], recurringItems: [], savingsGoals: [],
  };
  await page.addInitScript(({ raw, older }) => {
    if (localStorage.getItem('kakeibo_finance_state_v3') === null) {
      localStorage.setItem('kakeibo_finance_state_v3', raw);
      localStorage.setItem('kakeibo_finance_state_v2', older);
    }
  }, { raw: damaged, older: JSON.stringify(ledger) });
  await page.goto('/');
  const recovery = page.getByRole('heading', { name: '家計データを開けませんでした' });
  await expect(recovery).toBeVisible();
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(recovery).toBeVisible();
  await expect(page.getByText('総資産残高').first()).toHaveCount(0);
  const backup = { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'dmm-finance-backup', version: 1, state: ledger,
  })) };
  const input = page.getByLabel('バックアップから復元', { exact: true });
  await input.setInputFiles(backup);
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(recovery).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kakeibo_finance_state_v3'))).toBe(damaged);
  await input.setInputFiles(backup);
  await abortNextFinanceWrite(page);
  const confirm = page.getByRole('button', { name: '復元する' });
  await confirm.click();
  await expect(page.getByRole('dialog')).toContainText('復元できませんでした');
  await confirm.click();
  await expect(page.locator('main')).toContainText('¥32,100');
  await page.reload();
  await expect(page.locator('main')).toContainText('¥32,100');
  expect(await page.evaluate(() => localStorage.getItem('kakeibo_finance_state_v3'))).toBe(damaged);
});
