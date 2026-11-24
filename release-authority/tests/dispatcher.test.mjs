import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { makeDispatcher } from '../workers/dispatcher/index.mjs';

const pair = await generateKeyPair('RS256', { extractable: true });
const env = {
  GITHUB_APP_ID: '123', GITHUB_APP_INSTALLATION_ID: '456', GITHUB_APP_PKCS8_PEM: await exportPKCS8(pair.privateKey),
};
const input = { buildRunId: '234', verifierRunId: '567', workflowSha: 'a'.repeat(40) };
const run = {
  id: 567, conclusion: 'success', event: 'workflow_dispatch', path: '.github/workflows/release-authority.yml',
  head_branch: 'main', head_sha: input.workflowSha, repository: { id: 1462301394 }, head_repository: { id: 1462301394 },
};

function fakeGitHub(selectedRun = run, send = () => new Response(null, { status: 204 })) {
  const paths = [];
  const call = async (url, init) => {
    const target = new URL(url);
    paths.push(target.pathname);
    assert.equal(target.origin, 'https://api.github.com');
    assert.equal(init.redirect, 'error');
    if (target.pathname === '/app/installations/456/access_tokens') {
      await jwtVerify(init.headers.Authorization.slice(7), pair.publicKey, { issuer: '123', algorithms: ['RS256'] });
      assert.deepEqual(JSON.parse(init.body), { repository_ids: [1462301394], permissions: { actions: 'write' } });
      return Response.json({ token: 'fixture_installation_token' }, { status: 201 });
    }
    assert.equal(init.headers.Authorization, 'Bearer fixture_installation_token');
    if (target.pathname.endsWith('/actions/runs/567')) return Response.json(selectedRun);
    assert.equal(target.pathname, '/repos/disnana/DisnanaMoneyManagement/actions/workflows/release-authority.yml/dispatches');
    assert.deepEqual(JSON.parse(init.body), {
      ref: 'main', inputs: { operation: 'finalize', build_run_id: '234', verifier_run_id: '567', upload_to_play: 'true' },
    });
    return send();
  };
  return { paths, call };
}

test('dispatches the fixed finalizer after checking the verifier on a scoped installation token', async () => {
  const { paths, call } = fakeGitHub();
  assert.equal(await makeDispatcher(env, call)(input), 204);
  assert.equal(paths.length, 3);
});

test('wrong SHA or foreign verifier is rejected before dispatch and a transport error has unknown outcome', async () => {
  for (const patch of [{ head_sha: 'b'.repeat(40) }, { head_repository: { id: 998 } }, { conclusion: null }]) {
    const { paths, call } = fakeGitHub({ ...run, ...patch });
    assert.equal(await makeDispatcher(env, call)(input), 409);
    assert.equal(paths.length, 2);
  }
  const { paths, call } = fakeGitHub(run, () => { throw new Error('timeout'); });
  assert.equal(await makeDispatcher(env, call)(input), 502);
  assert.equal(paths.length, 3);
});
