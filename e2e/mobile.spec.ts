import { expect, test } from '@playwright/test';
import { abortNextFinanceWrite } from './abortFinanceWrite';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as unknown as { __errors: string[] }).__errors = errors;
  await page.goto('/');
  await expect(page.locator('h2', { hasText: 'ホーム' })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

test('home shows seed totals', async ({ page }) => {
  await expect(page.locator('main')).toContainText('¥4,125,921');
});

test('adding a transaction updates the balance and survives a reload', async ({ page }) => {
  await page.locator('nav button[aria-label="収支を記録"]').click();
  await page.locator('#tx-amount').fill('1000');
  await page.getByRole('button', { name: '登録', exact: true }).click();
  await expect(page.locator('main')).toContainText('¥4,124,921');
  await page.reload();
  await expect(page.locator('main')).toContainText('¥4,124,921');
});

test('tabs switch and keep their own state', async ({ page }) => {
  await page.getByRole('button', { name: '取引' }).first().click();
  await expect(page.locator('h2', { hasText: '取引' })).toBeVisible();
  await page.locator('input[type=search]').fill('Stripe');
  await page.getByRole('button', { name: 'ホーム' }).first().click();
  await expect(page.locator('h2', { hasText: 'ホーム' })).toBeVisible();
  await page.getByRole('button', { name: '取引' }).first().click();
  await expect(page.locator('input[type=search]')).toHaveValue('Stripe');
});

test('the system back action closes the entry sheet before leaving the app', async ({ page }) => {
  await page.locator('nav button[aria-label="収支を記録"]').click();
  await expect(page.locator('[role=dialog]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await expect(page.locator('h2', { hasText: 'ホーム' })).toBeVisible();
});

test('accounts open a detail page', async ({ page }) => {
  await page.getByRole('button', { name: '口座' }).last().click();
  // Wait until the Accounts pane is the active one, then scope to it (Home also has a same-named card button)
  const accounts = page.locator('.tab-pane').filter({ has: page.getByRole('region', { name: '資産サマリー' }) });
  await expect(accounts).toBeVisible();
  await accounts.getByRole('button', { name: /メインクレジットカード/ }).first().click();
  await expect(page.locator('[role=dialog]')).toContainText('メインクレジットカード');
});

test('a failed entry preserves the draft and a rapid retry records it only once', async ({ page }) => {
  await page.locator('nav button[aria-label="収支を記録"]').click();
  await page.locator('#tx-amount').fill('1250');
  await page.locator('#tx-title').fill('保存エラー再試行');
  await abortNextFinanceWrite(page);
  await page.getByRole('button', { name: '続けて登録', exact: true }).click();

  const failure = page.getByRole('alertdialog');
  await expect(failure).toContainText('保存できませんでした');
  await failure.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('#tx-amount')).toHaveValue('1250');
  await expect(page.locator('#tx-title')).toHaveValue('保存エラー再試行');
  await expect(page.locator('main')).toContainText('¥4,125,921');

  const register = page.getByRole('button', { name: '登録', exact: true });
  await register.evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('¥4,124,671');
  await page.reload();
  await expect(page.locator('main')).toContainText('¥4,124,671');
});

test('backup export reports the share result and clears success when sharing is cancelled', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', { value: async ({ files }: ShareData) => {
      if (files?.[0].name.endsWith('.csv')) throw new DOMException('user cancelled', 'AbortError');
    } });
  });
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.getByRole('button', { name: /データ管理・バックアップ/ }).click();
  const sheet = page.getByRole('dialog', { name: 'データ管理・バックアップ' });
  await sheet.getByRole('button', { name: '保存する', exact: true }).click();
  await expect(sheet.getByRole('status')).toContainText('JSONファイルを共有しました');
  const csv = sheet.getByRole('button', { name: 'CSV出力' });
  await csv.click();
  await expect(csv).toBeEnabled();
  await expect(sheet.getByRole('status')).toHaveCount(0);
  await expect(sheet.getByRole('alert')).toHaveCount(0);
});
