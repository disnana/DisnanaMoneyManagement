import { expect, test } from '@playwright/test';
import type { FinanceState, Transaction } from '../packages/core/src/types/finance';

test('daily and monthly totals agree across the ledger, dashboard and reports', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-03-15T12:00:00Z'));
  const expense: Transaction = {
    id: 'advance', title: '立替の昼食', type: 'expense', amount: 3000, accountId: 'cash',
    categoryId: 'food', date: '2026-03-11', advance: { for: '同僚' },
  };
  const data: FinanceState = {
    accounts: [
      { id: 'cash', name: '財布', type: 'cash', initialBalance: 50000 },
      { id: 'bank', name: '銀行', type: 'bank', initialBalance: 0 },
    ],
    transactions: [
      expense,
      { id: 'transfer', title: '入金', type: 'transfer', date: expense.date, categoryId: 'transfer',
        accountId: 'cash', toAccountId: 'bank', amount: 10000, platformTransferFee: 100, transferFee: 120 },
      { id: 'refund', title: '立替の回収', type: 'income', amount: 3000, date: '2026-03-12',
        accountId: 'cash', categoryId: 'other_income', reimbursementOf: expense.id },
      { id: 'lunch', title: '自分の昼食', type: 'expense', amount: 490, date: '2026-03-13', accountId: 'cash', categoryId: 'food' },
      { id: 'salary', title: '給与', type: 'income', amount: 1250, date: '2026-03-13', accountId: 'bank', categoryId: 'salary' },
    ],
    budgets: [{ categoryId: 'food', monthlyLimit: 10000 }],
    recurringItems: [], savingsGoals: [],
  };
  await page.addInitScript((saved) => localStorage.setItem('kakeibo_finance_state_v3', saved), JSON.stringify(data));
  await page.goto('/');
  const hero = page.getByRole('region', { name: '主要財務指標' });
  await expect(hero.getByText('¥1,250', { exact: true })).toBeVisible();
  await expect(hero.getByText('¥710', { exact: true })).toBeVisible();

  const navigation = page.getByRole('navigation', { name: 'モバイルナビゲーション' });
  await navigation.getByRole('button', { name: '取引', exact: true }).click();
  const ledger = page.getByRole('region', { name: '取引一覧' });
  const advanceDay = ledger.locator('section').filter({ hasText: '立替の昼食' });
  await expect(advanceDay.getByText('-¥220', { exact: true })).toBeVisible();
  const paybackDay = ledger.locator('section').filter({ hasText: '立替の回収' });
  await expect(paybackDay.getByText('¥0', { exact: true })).toBeVisible();

  await navigation.getByRole('button', { name: '分析・予算' }).click();
  await expect(page.getByText('総支出（手数料含む）', { exact: true }).locator('..')).toContainText('¥710');
  await page.getByRole('tab', { name: '予算', exact: true }).click();
  await expect(page.getByText('予算対象カテゴリの支出', { exact: true }).locator('..')).toContainText('¥490');
});
