// Run against a local Expo Web export. Each scenario gets its own temporary browser profile.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { historyFixture } from './history-fixture.mjs';

const [exportPath, outputPath, label] = process.argv.slice(2);
if (!exportPath || !outputPath || !label) throw new Error('Use: node history-web-check.mjs <expo-export> <results-folder> <label>');
const root = path.resolve(exportPath);
await mkdir(outputPath, { recursive: true });
const report = { label, cases: [] };
const types = { '.html': 'text/html', '.js': 'application/javascript', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.extname(pathname) ? path.resolve(root, '.' + pathname) : path.join(root, 'index.html');
    if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) throw new Error('Missing export file');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
report.browser = browser.version();
const choices = (page, name) => {
  const label = new RegExp('^' + name + '(の明細)?$');
  return page.getByRole('button', { name: label }).or(page.getByRole('tab', { name: label })).or(page.getByRole('radio', { name: label }));
};

async function snapshot(page, titles) {
  return page.evaluate(titles => {
    const wanted = new Set(titles);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let mounted = 0;
    const visible = [];
    let firstRowY;
    let first;
    const safeBottom = document.querySelector('a[aria-label="ホーム"], [role="tab"][aria-label="ホーム"]')?.getBoundingClientRect().top ?? innerHeight;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!wanted.has(node.textContent)) continue;
      const el = node.parentElement;
      if (el.closest('[aria-hidden="true"]')) continue;
      mounted++;
      first ??= el;
      const box = el.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= safeBottom && box.left >= 0 && box.right <= innerWidth) {
        visible.push(node.textContent);
        firstRowY ??= Math.round(box.top);
      }
    }
    // The active page is identified from a real row, not one of the two neighboring month previews.
    let scroller;
    let scrollAncestors = 0;
    for (let el = first; el; el = el.parentElement) {
      if (['scroll', 'auto'].includes(getComputedStyle(el).overflowY)) { scroller ??= el; scrollAncestors++; }
    }
    return { mounted, documentElements: document.getElementsByTagName('*').length, visible, firstRowY, scrollAncestors,
      pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, top: Math.round(scroller?.scrollTop ?? 0),
      scrollHeight: scroller?.scrollHeight ?? 0, clientHeight: scroller?.clientHeight ?? 0 };
  }, titles);
}

async function scrollChecks(page, titles, result, oldest) {
  const target = await page.evaluateHandle(names => {
    const wanted = new Set(names);
    const nodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (nodes.nextNode()) {
      if (!wanted.has(nodes.currentNode.textContent)) continue;
      const leaf = nodes.currentNode.parentElement;
      if (leaf.closest('[aria-hidden="true"]')) continue;
      for (let el = leaf; el; el = el.parentElement) {
        if (['scroll','auto'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el;
      }
    }
  }, titles);
  const scroller = target.asElement();
  assert.ok(scroller, 'a scrollable active list');
  const box = await scroller.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 650);
  await page.waitForFunction(el => el.scrollTop > 0, scroller);
  result.afterWheel = await snapshot(page, titles);
  const frameSample = page.evaluate(() => new Promise(resolve => {
    const intervals = [];
    let first, previous;
    function tick(now) {
      first ??= now;
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      if (now - first < 1500) return requestAnimationFrame(tick);
      intervals.sort((a, b) => a - b);
      resolve({ frames: intervals.length, p95Ms: Number(intervals[Math.ceil(intervals.length * .95) - 1].toFixed(1)),
        over32ms: intervals.filter(value => value > 32).length });
    }
    requestAnimationFrame(tick);
  }));
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 185);
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  result.wheelFrames = await frameSample;
  if (process.env.WHEEL_SAMPLE_ONLY === '1') {
    await scroller.dispose();
    return;
  }
  const bottomRows = await scroller.evaluate(async (el, date) => {
    const oldestHeading = new RegExp(Number(date.slice(5, 7)) + '月' + Number(date.slice(8)) + '日');
    let seenOldest = false, previousHeight = 0, stable = 0, attempts = 0;
    const started = performance.now();
    while (performance.now() - started < 190000) {
      el.scrollTop = el.scrollHeight;
      await new Promise(resolve => setTimeout(resolve, 65));
      attempts++;
      const atEnd = el.scrollHeight - el.clientHeight - el.scrollTop < 2;
      stable = atEnd && el.scrollHeight === previousHeight ? stable + 1 : 0;
      previousHeight = el.scrollHeight;
      if (!seenOldest) seenOldest = Array.from(el.querySelectorAll('[role="heading"]')).some(h => oldestHeading.test(h.getAttribute('aria-label')));
      if (seenOldest && stable >= 10) break;
    }
    return { bottomDistance: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop),
      attempts, seenOldest, traversalMs: Math.round(performance.now() - started) };
  }, oldest.date);
  result.atEnd = { ...await snapshot(page, titles), ...bottomRows };
  // A visual row must appear after the virtual window settles, even on a deep jump.
  assert.ok(result.atEnd.visible.length > 0, 'viewport at scroll end contains transactions');
  assert.ok(result.atEnd.bottomDistance < 5, 'reached end of month');
  assert.ok(result.atEnd.seenOldest, 'visited the oldest date heading');
  const last = page.getByText(oldest.title, { exact: true }).last();
  await last.click();
  await page.waitForURL(url => url.pathname === '/add' && url.searchParams.get('id') === oldest.id);
  result.atEnd.openedId = oldest.id;
  await page.goBack();
  await page.getByRole('heading', { name: '取引', exact: true }).waitFor();
  result.afterReturnTop = (await snapshot(page, titles)).top;
  // The browser may have replaced the screen element while the editor was open.
  if (await scroller.evaluate(el => el.isConnected)) await scroller.evaluate(el => { el.scrollTop = 0; });
  await page.getByText('青葉ベーカリー', { exact: true }).first().waitFor();
  if (result.count === 50) {
    const firstRow = page.getByText('青葉ベーカリー', { exact:true }).filter({ visible:true }).first();
    await firstRow.locator('xpath=ancestor::*[@tabindex="0" or self::button][1]').focus();
    const bounds = await snapshot(page, titles);
    await page.keyboard.press('PageDown');
    await page.waitForFunction(el => el.scrollTop > 100, scroller);
    const down = await snapshot(page, titles);
    await page.keyboard.press('PageUp');
    await page.waitForFunction((state) => state.el.scrollTop < state.down, { el: scroller, down: down.top });
    const up = await snapshot(page, titles);
    result.keyboardScroll = { down: down.top, up: up.top, from:bounds.top, documentX: await page.evaluate(() => scrollX) };
  }
  await scroller.dispose();
}

async function deepPaths(page, fixture, result) {
  const oldestDay = fixture.transactions.map(tx => tx.date).sort()[0];
  const entries = fixture.transactions.filter(tx => tx.date === oldestDay);
  const date = oldestDay.split('-').map(Number);
  const start = performance.now();
  await page.getByRole('button', { name: /カレンダー(表示|に切り替え)/ }).click();
  const day = page.getByRole('button', { name: `${date[0]}年${date[1]}月${date[2]}日 ${entries.length}件` });
  await day.click();
  const first = page.getByText(entries[0].title, { exact:true }).filter({ visible:true }).first();
  await first.waitFor();
  const toDayMs = Math.round(performance.now() - start);
  const count = (await snapshot(page, [...new Set(entries.map(tx => tx.title))])).mounted;
  assert.equal(count, entries.length);
  await first.click();
  await page.waitForURL(url => url.pathname === '/add' && url.searchParams.get('id') === entries[0].id);
  const toEditorMs = Math.round(performance.now() - start);
  await page.goBack();
  await first.locator('xpath=ancestor::*[@tabindex="0" or self::button][1]').focus();
  await page.keyboard.press('End');
  const last = page.getByText(entries.at(-1).title, { exact:true }).filter({ visible:true }).last();
  await page.waitForFunction(el => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }, await last.elementHandle());
  await last.click();
  await page.waitForURL(url => url.pathname === '/add' && url.searchParams.get('id') === entries.at(-1).id);
  await page.goBack();
  const searchStart = performance.now();
  await page.getByRole('button', { name:'取引を検索' }).click();
  await page.getByRole('textbox', { name:'検索キーワード' }).fill('青葉');
  await page.getByText('青葉ベーカリー', { exact:true }).filter({ visible:true }).last().click();
  await page.waitForURL(url => url.pathname === '/add' && url.searchParams.get('id') === 'preview-0');
  result.deepPaths = { oldestDay, withinDay: count, toDayMs, toEditorMs, firstId: entries[0].id, endId: entries.at(-1).id,
    searchMs: Math.round(performance.now() - searchStart), searchId: 'preview-0' };
}

async function runCase(spec) {
  const { count, width, theme, large, flow, audit, filtered } = spec;
  const name = `${label}-${count}-${width}-${theme}${large ? '-large' : ''}${filtered ? '-filtered' : ''}`;
  const fixture = process.env.FIXTURE_DIR ? JSON.parse(await readFile(path.join(process.env.FIXTURE_DIR, `${count}.json`), 'utf8')) : historyFixture(count);
  if (filtered) fixture.transactions = fixture.transactions.filter(tx => tx.type !== 'income');
  if (large) fixture.transactions[0].amount = 9876543210;
  const titles = [...new Set(fixture.transactions.map(tx => tx.title))];
  const ctx = await browser.newContext({ locale: 'ja-JP', colorScheme: theme, viewport: { width, height: width >= 600 ? 960 : Math.round(width * 2.22) } });
  const result = { name, ...spec, errors: [] };
  report.cases.push(result);
  try {
    // Isolated origin and profile: migration reads the normal on-disk public backup format.
    await ctx.addInitScript(state => {
      if (!sessionStorage.getItem('fixture-seeded')) {
        localStorage.setItem('kakeibo_finance_state_v3', JSON.stringify(state));
        localStorage.setItem('dmm_start_guide', 'done');
        sessionStorage.setItem('fixture-seeded', '1');
      }
    }, fixture);
    const page = await ctx.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-11-22T03:00:00Z'));
    await page.goto(origin);
    const historyTab = page.getByRole('tab', { name: '取引', exact: true }).or(page.getByRole('link', { name: '取引', exact: true }));
    await historyTab.waitFor({ timeout: 90000 });
    const start = performance.now();
    await historyTab.click({ timeout: 90000 });
    await page.getByRole('heading', { name: '取引', exact: true }).waitFor({ timeout: 120000 });
    await page.getByRole('button', { name: '取引を検索', exact: true }).waitFor();
    const ready = count ? page.getByText('青葉ベーカリー', { exact: true }) : page.getByText(/取引.*ありません|取引.*まだ/);
    await ready.first().waitFor({ timeout: 120000 });
    if (count) await page.waitForFunction(title => Array.from(document.querySelectorAll('[dir="auto"]')).some(el => el.textContent === title && !el.closest('[aria-hidden="true"]') && el.getBoundingClientRect().width > 0), '青葉ベーカリー', { timeout: 90000 });
    result.tabToRowMs = Math.round(performance.now() - start);
    await page.evaluate(() => document.fonts.ready);
    if (large) {
      // Deliberate web-only text stress; js-applied font size does not emulate the native OS setting.
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('[dir="auto"]')).filter(el => el.textContent.trim());
        const styles = nodes.map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight]);
        for (const [el, size, height] of styles) {
          el.style.setProperty('font-size', `${parseFloat(size) * 1.5}px`, 'important');
          if (height.endsWith('px')) el.style.setProperty('line-height', `${parseFloat(height) * 1.5}px`, 'important');
        }
      });
      const money = page.getByText(/^-¥9,876,543,210$|^−¥9,876,543,210$/).first();
      result.largeAmount = await money.evaluate(el => {
        const box = el.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(el);
        const ink = range.getBoundingClientRect();
        return { fontSize: getComputedStyle(el).fontSize, cell: Math.round(box.width), text: Math.round(ink.width),
          fitsViewport: ink.left >= 0 && ink.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1 };
      });
      result.longAmounts = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const output = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!/^[+−-]?¥[\d,]+$/.test(node.textContent) || node.textContent.length < 12) continue;
          const el = node.parentElement;
          if (el.closest('[aria-hidden="true"]')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const box = range.getBoundingClientRect();
          range.setStart(node, 0); range.setEnd(node, 1);
          const sign = range.getBoundingClientRect();
          const firstDigit = node.textContent.search(/\d/);
          range.setStart(node, firstDigit); range.setEnd(node, firstDigit + 1);
          const digit = range.getBoundingClientRect();
          const clipping = [];
          for (let parent = el; parent; parent = parent.parentElement) {
            if (!['hidden','clip'].includes(getComputedStyle(parent).overflowX)) continue;
            const rect = parent.getBoundingClientRect();
            if (rect.width && (box.left < rect.left - 1 || box.right > rect.right + 1)) clipping.push(parent.tagName);
          }
          output.push({ value: node.textContent, lines: Math.round(Math.abs(digit.top - sign.top)) === 0 ? 'sign with first digit' : 'isolated sign',
            fits: el.scrollWidth <= el.clientWidth + 1 && !clipping.length && box.left >= 0 && box.right <= innerWidth,
            width: Math.round(box.width), cell: el.clientWidth, cutoffAncestors: clipping.length });
        }
        return output;
      });
    }
    result.initial = await snapshot(page, titles);
    if (audit) {
      result.controls = {};
      const controls = {
        search: page.getByRole('button', { name: '取引を検索' }),
        previousMonth: page.getByRole('button', { name: '前月', exact:true }),
        ledger: page.getByRole('button', { name: /家計グループ/ }),
        expenseFilter: choices(page, '支出'),
      };
      for (const [key, control] of Object.entries(controls)) {
        const box = await control.first().boundingBox();
        if (box) result.controls[key] = [Math.round(box.width), Math.round(box.height)];
      }
      result.accessibleRows = await page.getByRole('button', { name: /青葉ベーカリー/ }).count();
    }
    if (count <= 5) await page.screenshot({ path: path.join(outputPath, `${name}.png`) });
    if (process.env.DEEP_PATHS_ONLY === '1') await deepPaths(page, fixture, result);
    else if (count >= 50) {
      const oldest = [...fixture.transactions].sort((a, b) => b.date.localeCompare(a.date)).at(-1);
      await scrollChecks(page, titles, result, oldest);
    }
    if (audit && process.env.AXE_PATH) {
      await page.addScriptTag({ path: process.env.AXE_PATH });
      result.violations = await page.evaluate(async () => {
        const audit = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } });
        return audit.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length, examples: v.nodes.slice(0, 3).map(n => ({ target: n.target, html: n.html, detail: n.failureSummary })) }));
      });
    }
    if (flow) await runFlows(page, titles, result);
    if (filtered) {
      await choices(page, '収入').click();
      await page.waitForFunction(() => !Array.from(document.querySelectorAll('[dir="auto"]')).some(el => el.textContent === '青葉ベーカリー' && !el.closest('[aria-hidden="true"]')));
      result.filteredEmptyView = await page.locator('body').ariaSnapshot();
      const showAll = page.getByRole('button', { name: 'すべての取引を表示' });
      result.emptyFilterAction = await showAll.isVisible();
      if (result.emptyFilterAction) await showAll.click(); else await choices(page, 'すべて').click();
      await page.getByText('青葉ベーカリー', { exact: true }).first().waitFor();
    }
    assert.deepEqual(result.errors, []);
    assert.equal(result.initial.pageWidth, width);
  } catch (e) { result.failure = String(e.message).slice(0, 260); }
  finally { await ctx.close(); }
  console.log(JSON.stringify({ name, mounted: result.initial?.mounted, end: result.atEnd?.mounted, readyMs: result.tabToRowMs, failure: result.failure }));
  await writeFile(path.join(outputPath, `${label}-web.json`), JSON.stringify(report, null, 2));
}

async function runFlows(page, titles, result) {
  result.flows = {};
  const search = page.getByRole('button', { name: '取引を検索' });
  await search.focus();
  let reachedRow = false;
  let hiddenStops = 0;
  for (let i = 0; i < 65; i++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({
      row: document.activeElement?.textContent.includes('青葉ベーカリー'),
      hidden: Boolean(document.activeElement?.closest('[aria-hidden="true"]')),
    }));
    if (focus.hidden) hiddenStops++;
    if (focus.row && !focus.hidden) { reachedRow = true; break; }
  }
  result.tabTraversal = { reachedRow, hiddenStops };
  const verify = async (name, action) => {
    try { await action(); result.flows[name] = 'pass'; } catch (e) { result.flows[name] = String(e.message).slice(0, 190); }
  };
  await verify('income filter', async () => {
    const all = choices(page, 'すべて'), income = choices(page, '収入');
    result.filterStateBefore = { all: await all.getAttribute('aria-pressed'), income: await income.getAttribute('aria-pressed') };
    await income.click();
    await page.getByText('11月のお給料', { exact: true }).waitFor();
    assert.deepEqual((await snapshot(page, titles)).visible, ['11月のお給料']);
    for (const amount of [/^¥268,000$/, /^¥5,680$/, /^[+]?¥262,320$/]) {
      await page.getByText(amount).filter({ visible: true }).first().waitFor();
    }
    result.filterStateAfter = { all: await all.getAttribute('aria-pressed'), income: await income.getAttribute('aria-pressed') };
    await all.click();
  });
  await verify('calendar and list', async () => {
    await page.getByRole('button', { name: /カレンダー(表示|に切り替え)/ }).click();
    await page.getByText('月', {exact: true}).first().waitFor();
    await page.getByRole('button', { name: /一覧(表示|に切り替え)/ }).click();
    await page.getByText('青葉ベーカリー', { exact: true }).first().waitFor();
  });
  await verify('empty ledger', async () => {
    await page.getByRole('button', { name: /家計グループ/ }).click();
    await page.getByText('家庭', { exact:true }).last().click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('[dir="auto"]')).some(el => el.textContent === '青葉ベーカリー' && !el.closest('[aria-hidden="true"]')));
    const reset = page.getByRole('button', { name: '全グループを表示' });
    result.emptyLedgerAction = await reset.isVisible();
    if (result.emptyLedgerAction) await reset.click();
    else {
      await page.getByRole('button', { name: /家計グループ/ }).click();
      await page.getByText('すべて', { exact:true }).last().click();
    }
    await page.getByText('青葉ベーカリー', { exact: true }).first().waitFor();
  });
  await verify('keyboard edit and back', async () => {
    const row = page.getByText('青葉ベーカリー',{exact: true}).first().locator('xpath=ancestor::*[@tabindex="0" or self::button][1]');
    await row.focus(); await page.keyboard.press('Enter');
    await page.waitForURL(/\/add\?id=preview-0/);
    await page.goBack();
    await page.getByText('青葉ベーカリー', { exact: true }).first().waitFor();
  });
  await verify('search long Japanese transaction and return', async () => {
    await search.click();
    await page.waitForURL(/\/search$/);
    await page.getByRole('textbox', { name: '検索キーワード' }).fill('来年のカレンダー');
    const title = '街の本屋と文具店 駅前店で手帳と来年のカレンダーを購入';
    await page.getByText(title, { exact:true }).filter({ visible:true }).last().click();
    await page.waitForURL(/\/add\?id=preview-1/);
    await page.goBack();
    await page.getByRole('textbox', { name: '検索キーワード' }).waitFor();
    await page.goBack();
    await page.getByRole('heading', { name: '取引', exact:true }).waitFor();
  });
  await verify('long press delete and cancel', async () => {
    await page.getByText('青葉ベーカリー', { exact: true }).filter({ visible:true }).first().click({ delay: 800 });
    await page.getByText('削除', { exact: true }).filter({ visible:true }).last().click();
    await page.getByRole('heading', { name: '取引を削除しますか？' }).waitFor();
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await page.getByText('青葉ベーカリー', { exact:true }).first().waitFor();
    assert.equal((await snapshot(page, titles)).mounted, 5);
  });
  await verify('previous and next month', async () => {
    await page.getByRole('button', { name: '前月', exact: true }).click();
    await page.getByRole('button', { name: /2026年10月/ }).waitFor();
    await page.getByRole('button', { name: '翌月', exact: true }).click();
    await page.getByText('青葉ベーカリー', { exact: true }).first().waitFor();
  });
}


async function verifyRecovery() {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 360, height: 799 } });
  try {
    const page = await ctx.newPage();
    await ctx.addInitScript(() => {
      localStorage.setItem('kakeibo_finance_state_v3', '{');
      localStorage.setItem('dmm_start_guide', 'done');
      window.observedLoading = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector('[aria-label="家計データを読み込み中"]')) window.observedLoading = true;
      });
      observer.observe(document, { childList: true, attributes: true, subtree: true });
    });
    await page.clock.setFixedTime(new Date('2026-11-22T03:00:00Z'));
    await page.goto(origin + '/transactions');
    await page.getByRole('heading', { name: '家計データを開けませんでした' }).waitFor();
    const retained = await page.evaluate(() => localStorage.getItem('kakeibo_finance_state_v3'));
    assert.equal(retained, '{');
    await page.evaluate(state => localStorage.setItem('kakeibo_finance_state_v3', JSON.stringify(state)), historyFixture(5));
    await page.getByText('再読み込み', { exact:true }).click();
    await page.getByText('青葉ベーカリー', { exact:true }).first().waitFor();
    await ctx.setOffline(true);
    await choices(page, '収入').click();
    await page.getByText('11月のお給料', { exact:true }).first().waitFor();
    report.storage = { retainedOnDamagedInput: true, retryRecovered: true, offlineFilter: true, loadingObserved: await page.evaluate(() => window.observedLoading) };
  } catch (e) { report.storage = { failure: String(e.message).slice(0, 250) }; }
  finally { await ctx.close(); }
}

async function verifyMonthNavigation() {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 393, height: 872 } });
  try {
    const fixture = historyFixture(5);
    fixture.transactions[4].date = '2026-10-20';
    await ctx.addInitScript(state => {
      if (sessionStorage.getItem('fixture-seeded')) return;
      localStorage.setItem('kakeibo_finance_state_v3', JSON.stringify(state));
      localStorage.setItem('dmm_start_guide', 'done');
      sessionStorage.setItem('fixture-seeded', '1');
    }, fixture);
    const page = await ctx.newPage();
    page.setDefaultTimeout(12000);
    await page.clock.setFixedTime(new Date('2026-11-22T03:00:00Z'));
    await page.goto(origin + '/transactions');
    const nav = name => page.getByRole('link', { name, exact:true }).or(page.getByRole('tab', { name, exact:true }));
    const month = number => page.getByRole('button', { name: new RegExp('2026年' + number + '月') }).first();
    const prior = () => page.getByRole('button', { name: '前月', exact:true }).click();
    const history = async () => { await nav('取引').click(); await month(11).waitFor(); };
    const october = page.getByText('電車で買い出し', { exact:true }).first();
    await month(11).waitFor();
    await prior();
    await month(10).waitFor();
    await october.waitFor();
    await page.getByRole('button', { name:'取引を検索' }).click();
    await page.getByRole('textbox', { name: '検索キーワード' }).waitFor();
    await page.goBack();
    await month(10).waitFor();
    await october.click();
    await page.waitForURL(/\/add\?id=preview-4/);
    await page.goBack();
    await month(10).waitFor();
    await nav('分析').click();
    await month(11).waitFor();
    await history();
    await prior();
    await month(10).waitFor();
    await nav('ホーム').click();
    await month(11).waitFor();
    await history();
    report.navigation = { searchBackOctober:true, editBackOctober:true, analyticsNovember:true, homeNovember:true, historyReturnsNovember:true,
      inertHiddenSurfaces: await page.locator('[aria-hidden="true"][inert]').count() };
  } catch (e) { report.navigation = { failure: String(e.message).slice(0, 320) }; }
  finally { await ctx.close(); }
}

const cases = [
  { count: 5, width: 393, theme:'light', flow:true, audit:true }, { count: 5, width: 393, theme:'dark', audit:true },
  { count: 50, width: 393, theme:'light' }, { count: 1000, width: 393, theme:'light' }, { count: 10000, width: 393, theme:'light' },
  { count: 0, width:360, theme:'light' }, { count:5, width:360, theme:'light', large:true }, { count:5, width:600, theme:'dark' }, { count:5, width:360, theme:'dark', filtered:true },
];
try {
  for (const spec of cases) {
    if (process.env.DEEP_PATHS_ONLY === '1' && spec.count !== 10000) continue;
    if (process.env.WHEEL_SAMPLE_ONLY === '1' && spec.count < 50) continue;
    if (!process.env.CASE_FILTER || new RegExp(process.env.CASE_FILTER).test(`${spec.count}-${spec.width}-${spec.theme}`)) await runCase(spec);
  }
  if (process.env.WHEEL_SAMPLE_ONLY !== '1') {
    await verifyRecovery();
    await verifyMonthNavigation();
  }
  await writeFile(path.join(outputPath, `${label}-web.json`), JSON.stringify(report, null, 2));
  const failed = report.cases.some(c => c.failure || Object.values(c.flows ?? {}).some(v => v !== 'pass'));
  if (failed || report.storage?.failure || report.navigation?.failure) process.exitCode = 1;
}
finally { await browser.close(); await new Promise(done => server.close(done)); }
