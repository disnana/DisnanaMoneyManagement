import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = process.env.RELEASE_EVIDENCE_DIR;
const file = (name) => resolve(output, name);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const digest = (data) => createHash('sha256').update(data).digest('hex');
const gradle = await json(file('gradle-dependencies.json'));
const bunRoot = await json(file('bun-root.json'));
const bunMobile = await json(file('bun-mobile.json'));
const bunAuthority = await json(file('bun-authority.json'));
if ([bunRoot, bunMobile, bunAuthority].some(result => Object.keys(result).length)
  || !Array.isArray(gradle) || gradle.length === 0) {
  throw new Error('Missing or unsuccessful dependency audit');
}
const gradleQueries = gradle.map(({ group, name, version }) => ({
  package: { ecosystem: 'Maven', name: `${group}:${name}` }, version,
}));
for (let offset = 0; offset < gradleQueries.length; offset += 100) {
  const queries = gradleQueries.slice(offset, offset + 100);
  const response = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }),
    redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Gradle OSV audit returned HTTP ${response.status}`);
  const { results } = await response.json();
  if (!Array.isArray(results) || results.length !== queries.length) throw new Error('Incomplete Gradle audit response');
  for (const [index, result] of results.entries()) {
    if (result.next_page_token || result.vulns?.length || Object.keys(result).some(key => key !== 'vulns')) {
      throw new Error(`Gradle audit requires review: ${queries[index].package.name}`);
    }
  }
}

const npm = new Map();
const lockPaths = ['bun.lock', 'apps/mobile/bun.lock', 'release-authority/bun.lock'];
const lockfiles = {};
for (const path of lockPaths) {
  const bytes = await readFile(path);
  lockfiles[path] = digest(bytes);
  const lock = Bun.JSONC.parse(bytes.toString('utf8'));
  for (const [resolved] of Object.values(lock.packages)) {
    const delimiter = resolved.lastIndexOf('@');
    const name = resolved.slice(0, delimiter);
    const version = resolved.slice(delimiter + 1);
    if (!name || !/^\d+\.\d+\.\d+/.test(version)) throw new Error('Unsupported Bun lockfile entry');
    const purl = `pkg:npm/${name.split('/').map(encodeURIComponent).join('/')}@${encodeURIComponent(version)}`;
    npm.set(purl, { type: 'library', name, version, purl });
  }
}
const components = [...npm.values(), ...gradle.map(({ group, name, version }) => ({
  type: 'library', group, name, version,
  purl: `pkg:maven/${encodeURIComponent(group)}/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
}))].sort((a, b) => a.purl.localeCompare(b.purl));
const sbom = JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, components });
const audit = JSON.stringify({
  bunRoot: { exitCode: 0, result: bunRoot }, bunMobile: { exitCode: 0, result: bunMobile },
  bunAuthority: { exitCode: 0, result: bunAuthority },
  gradleDependencies: { exitCode: 0, scanned: gradle.length, service: 'https://api.osv.dev/v1/querybatch' },
  gradleVerification: { mode: 'strict', metadataSha256: digest(await readFile('apps/mobile/release-verification/verification-metadata.xml')),
    lockSha256: digest(await readFile('apps/mobile/release-verification/gradle.lockfile')) },
  tests: { exitCode: 0 }, lockfiles, bunVersion: Bun.version,
});
const { expo } = await json('apps/mobile/app.json');
const aab = await readFile('apps/mobile/android/app/build/outputs/bundle/release/app-release.aab');
const quality = JSON.stringify({
  schema: 'disnana.release-quality.v1', commitSha: process.env.GITHUB_SHA, packageName: expo.android.package,
  versionName: expo.version, versionCode: expo.android.versionCode,
  unsignedAabSha256: digest(aab), auditReportSha256: digest(audit), sbomSha256: digest(sbom),
});
await Promise.all([
  writeFile(file('quality.json'), quality, { flag: 'wx' }),
  writeFile(file('audit.json'), audit, { flag: 'wx' }),
  writeFile(file('sbom.cdx.json'), sbom, { flag: 'wx' }),
]);
