import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('pages a full day of search results and resets to the first page when filtered', async ({ page }, testInfo) => {
  const count = 121;
  await page.addInitScript((count) => {
    const date = new Date();
    const localDay = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), '01'].join('-');
    localStorage.setItem('kakeibo_finance_state_v3', JSON.stringify({
      accounts: [{ id: 'cash', type: 'cash', name: '現金', initialBalance: 0 }],
      transactions: Array.from({ length: count }, (_, i) => ({
        id: 'tx' + i, date: localDay, categoryId: 'food', accountId: 'cash', type: 'expense',
        amount: 100, title: '描画検証' + String(i).padStart(3, '0'),
      })), budgets: [], savingsGoals: [], recurringItems: [],
    }));
  }, count);

  await page.goto('/?tab=transactions');
  const search = page.getByRole('searchbox');
  await search.fill('描画検証');
  const list = page.getByRole('region', { name: '取引一覧' });
  const pager = page.getByRole('navigation', { name: '取引のページ切り替え' });
  const rows = list.getByText(/^描画検証\d{3}$/);
  await expect(rows).toHaveCount(50);
  await pager.getByRole('button', { name: '次のページ' }).click();
  await expect(list.getByText('描画検証050', { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(50);
  if (testInfo.project.name === 'mobile') {
    await expect(list.getByText('-¥12,100')).toBeVisible();
  } else {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '検索結果をCSV出力' }).click(),
    ]);
    const csv = await readFile((await download.path())!, 'utf8');
    expect(csv.match(/描画検証/g)).toHaveLength(count);
  }

  await pager.getByRole('button', { name: '次のページ' }).click();
  await expect(rows).toHaveCount(21);
  await expect(pager.getByRole('button', { name: '次のページ' })).toBeDisabled();
  await expect(list.getByText('描画検証120', { exact: true })).toBeAttached();

  await search.fill('120');
  await expect(rows).toHaveCount(1);
  await expect(pager).toHaveCount(0);
  await search.fill('描画検証');
  await expect(list.getByText('描画検証000', { exact: true })).toBeVisible();
  await expect(pager.getByRole('button', { name: '前のページ' })).toBeDisabled();
});
