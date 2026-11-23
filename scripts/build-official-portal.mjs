import { cp, mkdir, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const build = spawnSync(process.execPath, ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_OFFICIAL_PORTAL: '1', VITE_BASE_PATH: '/' },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const dist = new URL('dist/', root);
await mkdir(new URL('app/', dist), { recursive: true });
await rename(new URL('index.html', dist), new URL('app/index.html', dist));
await cp(new URL('portal/index.html', dist), new URL('index.html', dist));
