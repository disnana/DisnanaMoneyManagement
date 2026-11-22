// Run with Bun from the repository after installing the root and mobile dependencies.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { historyFixture } from './history-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mobile = createRequire(join(root, 'apps/mobile/package.json'));
const work = mkdtempSync(join(tmpdir(), 'mane-list-bench-'));
const flashVersion = mobile('expo/bundledNativeModules.json')['@shopify/flash-list'];
const fixture = `
import React, { memo } from 'react';
import { createRoot } from 'react-dom/client';
import { FlatList, SectionList, Text, View } from 'react-native';
import { List } from 'bench-expo-list';
import { FlashList } from 'bench-flash-list';

const query = new URLSearchParams(location.search);
const rows = await (await fetch('/rows?count=' + query.get('count'))).json();
const currency = new Intl.NumberFormat('ja-JP');
const Row = memo(function Row({ item }) {
  return <View dataSet={{ tx: item.id }} style={{
    height: 64, paddingHorizontal: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  }}>
    <Text numberOfLines={1} style={{ flexShrink: 1 }}>{item.title}</Text>
    <Text>{item.type === 'income' ? '＋' : item.type === 'expense' ? '−' : ''}¥{currency.format(item.amount)}</Text>
  </View>;
});
const id = item => item.id;
const cell = ({ item }) => <Row item={item}/>;
const sections = [{ key: 'month', data: rows }];
function App() {
  switch (query.get('list')) {
    case 'FlatList': return <FlatList data={rows} keyExtractor={id} renderItem={cell}/>;
    case 'SectionList': return <SectionList sections={sections} keyExtractor={id} renderItem={cell} stickySectionHeadersEnabled={false}/>;
    case 'List.ForEach': return <List><List.ForEach data={rows} keyExtractor={id}>{cell}</List.ForEach></List>;
    case 'FlashList': return <FlashList data={rows} keyExtractor={id} renderItem={cell}/>;
    case 'map': return <View style={{ flex: 1, overflowY: 'auto' }}>{rows.map(item => <Row key={item.id} item={item}/>)}</View>;
    default: throw Error('Unsupported list');
  }
}
createRoot(document.getElementById('root')).render(<App/>);
`;

let server;
let browser;
try {
  symlinkSync(realpathSync(join(root, 'apps/mobile/node_modules')), join(work, 'node_modules'), 'dir');
  // Use exactly Expo's bundled version. npm pack downloads the tarball outside the repository.
  const pack = JSON.parse(execFileSync('npm', [
    'pack', '@shopify/flash-list@' + flashVersion, '--ignore-scripts', '--json', '--pack-destination', work, '--cache', join(work, 'npm-cache'),
  ], { cwd: work, encoding: 'utf8' }));
  execFileSync('tar', ['-xf', join(work, pack[0].filename), '-C', work]);
  const entry = join(work, 'fixture.jsx');
  writeFileSync(entry, fixture);
  const bundled = await Bun.build({
    entrypoints: [entry], minify: true, target: 'browser',
    define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'use-web-implementations', setup(build) {
      build.onResolve({ filter: /^react-native$/ }, () => ({ path: mobile.resolve('react-native-web') }));
      build.onResolve({ filter: /^bench-expo-list$/ }, () => ({
        path: join(dirname(mobile.resolve('@expo/ui/package.json')), 'src/universal/List/index.tsx'),
      }));
      build.onResolve({ filter: /^bench-flash-list$/ }, () => ({ path: join(work, 'package/dist/index.js') }));
      build.onResolve({ filter: /^\.{1,2}\// }, ({ path, importer }) => {
        const web = resolve(dirname(importer), path.replace(/\.js$/, '') + '.web.js');
        if (existsSync(web)) return { path: web };
      });
    } }],
  });
  if (!bundled.success) throw new Error(bundled.logs.join('\n'));
  const [bundle] = bundled.outputs;
  server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/rows') return Response.json(historyFixture(Number(url.searchParams.get('count'))).transactions);
      if (url.pathname === '/app.js') return new Response(bundle, { headers: { 'Content-Type': 'text/javascript' } });
      return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style><div id="root"></div><script>globalThis.global=globalThis</script><script type="module" src="/app.js"></script></html>', { headers: { 'Content-Type': 'text/html' } });
    },
  });

  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'],
  });
  console.log(JSON.stringify({
    browser: browser.version(), expoUI: mobile('@expo/ui/package.json').version,
    rnWeb: mobile('react-native-web/package.json').version, flashList: flashVersion,
  }));
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, colorScheme: 'light', locale: 'ja-JP',
  });
  const datasetSizes = [1000, 10000];
  for (const count of datasetSizes) {
    for (const list of ['map', 'FlatList', 'SectionList', 'List.ForEach', 'FlashList']) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      try {
        await page.goto(server.url + '?list=' + list + '&count=' + count);
        await page.locator('[data-tx="preview-0"]').waitFor();
        await page.waitForTimeout(1500);
        const initial = await page.locator('[data-tx]').count();
        await page.mouse.move(175, 430);
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, 704);
          await page.waitForTimeout(180);
        }
        await page.waitForFunction(() => document.elementFromPoint(175, 430)?.closest('[data-tx]')?.dataset.tx === 'preview-61');
        await page.waitForTimeout(1500);
        const afterScroll = await page.locator('[data-tx]').count();
        assert.deepEqual(errors, []);
        if (list === 'map') assert.equal(initial, count);
        else assert.ok(initial < count && afterScroll < count);
        console.log(JSON.stringify({ count, list, initial, afterScroll, center: 'preview-61' }));
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser?.close();
  server?.stop(true);
  rmSync(work, { recursive: true, force: true });
}
