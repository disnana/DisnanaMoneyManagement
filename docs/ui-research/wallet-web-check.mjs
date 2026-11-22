// node docs/ui-research/wallet-web-check.mjs <Expo Web export> <screenshot directory> before|after
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [directory, output, version] = process.argv.slice(2);
assert.ok(directory && output && ['before', 'after'].includes(version));
const root = path.resolve(directory);
const origin = 'http://localhost:39965';
const fixture = JSON.parse(await readFile(new URL('./wallet-fixture.json', import.meta.url), 'utf8'));
const after = version === 'after';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const report = { browser: browser.version(), version, cases: [] };

function onActivePage(page, content) {
  return page.getByText(content, { exact: true }).and(page.locator(':not([aria-hidden="true"], [aria-hidden="true"] *, [inert], [inert] *)'));
}

async function frameWallet(firstRow) {
  await firstRow.evaluate(row => {
    for (let node = row.parentElement; node; node = node.parentElement) {
      if (!['scroll', 'auto'].includes(getComputedStyle(node).overflowY) || node.clientHeight >= node.scrollHeight) continue;
      node.scrollTop += row.getBoundingClientRect().top - node.getBoundingClientRect().top - 52;
      break;
    }
  });
}

async function amountBounds(locator) {
  return locator.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const { left, right } = range.getBoundingClientRect();
    let clipLeft = 0, clipRight = innerWidth;
    for (let parent = el; parent; parent = parent.parentElement) {
      if (!['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) continue;
      const bounds = parent.getBoundingClientRect();
      clipLeft = Math.max(clipLeft, bounds.left);
      clipRight = Math.min(clipRight, bounds.right);
    }
    return { text: el.textContent, left, right, clipLeft, clipRight, fits: left >= clipLeft - 1 && right <= clipRight + 1 && el.scrollWidth <= el.clientWidth + 1 };
  });
}

async function contextFor(width, height, colorScheme) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme, locale: 'ja-JP', serviceWorkers: 'block' });
  await context.route(origin + '/**', async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.extname(pathname) ? path.resolve(root, '.' + pathname) : path.join(root, 'index.html');
    if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 404, body: '' });
    try { await route.fulfill({ path: file }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await context.addInitScript(state => {
    if (sessionStorage.getItem('wallet-fixture')) return;
    localStorage.setItem('kakeibo_finance_state_v3', JSON.stringify(state));
    localStorage.setItem('dmm_start_guide', 'done');
    sessionStorage.setItem('wallet-fixture', '1');
  }, fixture);
  return context;
}

async function check(width, height, theme) {
  const context = await contextFor(width, height, theme);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.clock.setFixedTime(new Date('2026-11-22T03:00:00Z'));
    await page.goto(origin);
    const button = name => page.getByRole('button', { name });
    const bank = button(/^青葉銀行/);
    const total = onActivePage(page, '¥90,890');
    const nav = name => page.getByRole('link', { name, exact: true }).or(page.getByRole('tab', { name, exact: true }));
    const screenshot = key => page.screenshot({ path: path.join(output, `wallet-${version}-${width}-${theme}-${key}.png`) });
    const rowNumber = (row, amount) => row.getByText(amount, { exact: true });
    await bank.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await rowNumber(bank, '¥52,240').waitFor();
    await onActivePage(page, '¥78,490').waitFor();
    await button(/残りの.*件を表示/).first().waitFor();
    assert.equal(await button(/^予備口座/).count(), 0);
    assert.equal(await total.count(), after ? 1 : 0);
    await screenshot('home-top');
    await button(/残りの.*件を表示/).click();
    await rowNumber(button(/^交通用IC/), '¥0').waitFor();
    await rowNumber(button(/^調整口座/), '-¥650').waitFor();
    assert.equal(await button(/^青葉デビット/).count(), 0);
    if (after) {
      await total.waitFor();
      const lastRow = await button(/^ひなた工房/).boundingBox();
      const lastAmount = await total.boundingBox();
      assert.ok(lastAmount.y >= lastRow.y + lastRow.height - 1);
      const firstRight = (await amountBounds(rowNumber(bank, '¥52,240'))).right;
      assert.ok(Math.abs(firstRight - (await amountBounds(total)).right) < 2, 'home account and total share a right edge');
    }
    await frameWallet(bank);
    await screenshot('home-list');
    await button(/口座を折りたたむ/).click();
    assert.equal(await button(/^予備口座/).count(), 0);
    if (after) await total.waitFor();

    await button('総資産を隠す').click();
    await button('総資産を表示').waitFor();
    if (after) {
      for (const secret of ['52,240', '38,650', '90,890', '78,490']) {
        assert.ok(!(await page.locator('body').ariaSnapshot()).includes(secret), `masked accessibility tree: ${secret}`);
        assert.equal(await onActivePage(page, '¥' + secret).count(), 0);
      }
      await page.reload();
      await button('総資産を表示').waitFor();
      assert.equal(await total.count(), 0);
    }
    await button('総資産を表示').click();
    await rowNumber(bank, '¥52,240').waitFor();
    await button(/家計グループ:/).click();
    await page.getByRole('dialog').getByRole('button', { name: '家庭', exact: true }).click();
    await rowNumber(button(/^みなと銀行/), '¥38,650').waitFor();
    assert.equal(await bank.count(), 0);
    assert.equal(await onActivePage(page, '¥38,650').count(), after ? 3 : 2);
    await button(/家計グループ:/).click();
    await page.getByRole('dialog').getByRole('button', { name: 'すべて', exact: true }).click();

    await nav('口座').click();
    await rowNumber(bank, '¥52,240').waitFor();
    await total.waitFor();
    await rowNumber(button(/^予備口座/), '¥0').waitFor();
    await rowNumber(button(/^こもれびカード/), '¥12,400').waitFor();
    const debit = button(/^青葉デビット/);
    assert.ok((await debit.innerText()).includes('青葉銀行'));
    const lastBank = button(/^ひなた工房/);
    const bankY = (await lastBank.boundingBox()).y;
    const totalY = (await total.boundingBox()).y;
    assert.equal(totalY > bankY, after);
    if (after) assert.ok(totalY < (await debit.boundingBox()).y);
    const rightEdges = [await amountBounds(rowNumber(bank, '¥52,240')), await amountBounds(total)].map(amount => amount.right);
    if (after) assert.ok(Math.abs(rightEdges[0] - rightEdges[1]) < 2, 'account list and total share a right edge');
    await screenshot('accounts');

    const largeText = [];
    if (width === 320) {
      // Explicit CSS text stress, independent of Android accessibility fontScale measurements.
      await page.evaluate(() => {
        for (const item of Array.from(document.querySelectorAll('[dir="auto"]')).map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight])) {
          const [el, font, line] = item;
          el.style.fontSize = parseFloat(font) * 1.5 + 'px';
          if (line.endsWith('px')) el.style.lineHeight = parseFloat(line) * 1.5 + 'px';
        }
      });
      await frameWallet(bank);
      await screenshot('text150');
      for (const element of [rowNumber(bank, '¥52,240'), rowNumber(button(/^調整口座/), '-¥650'), total]) {
        const bounds = await amountBounds(element);
        largeText.push(bounds);
        if (after) assert.ok(bounds.fits, `entire balance at 320px / 150%: ${JSON.stringify(bounds)}`);
      }
    }
    await bank.click();
    await page.waitForURL(url => url.pathname === '/accounts/bank-a');
    await page.getByRole('heading', { name: '青葉銀行', exact: true }).waitFor();
    await page.goBack();
    await button('並べ替え').click();
    assert.equal(await total.count(), 0);
    await button('キャンセル').click();
    await total.waitFor();
    assert.deepEqual(errors, []);
    report.cases.push({ width, height, theme, collapsedHomeTotal: after, accountTotalBelowRows: totalY > bankY, rightEdges, largeText, creditBill: 12400, accountTotal: 90890, assets: 78490 });
  } finally { await context.close(); }
}

try {
  await check(393, 872, 'light');
  await check(320, 710, 'light');
  await check(393, 872, 'dark');
} finally {
  await writeFile(path.join(output, `wallet-${version}-checks.json`), JSON.stringify(report, null, 2));
  await browser.close();
}
