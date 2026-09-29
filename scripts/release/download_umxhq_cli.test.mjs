/** CLI dispatch must be explicit and must not acquire weights on import or help. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const target = new URL('./download_umxhq.mjs', import.meta.url);
test('a runnable download command exists', () => assert.ok(existsSync(target)));
if (existsSync(target)) {
  const m = await import(target);
  const invoke = (args) => spawnSync(process.execPath, [fileURLToPath(target), ...args], { encoding: 'utf8' });
  test('help runs without touching the network', () => {
    const result = invoke(['--help']); assert.equal(result.status, 0); assert.match(result.stdout, /--bootstrap/);
  });
  for (const args of [[], ['--url', 'https://evil.invalid'], ['--bootstrap'], ['--output', 'out'], ['--bootstrap', '--pin', 'x', '--output', 'out'], ['--bootstrap', '--output', 'out', '--output', 'other'], ['--pin'], ['--help', '--bootstrap'], ['--bootstrap', '--output', '--pin']]) {
    test(`invalid CLI invocation fails before acquisition: ${args.join(' ')}`, () => {
      const result = invoke(args); assert.equal(result.status, 2); assert.doesNotMatch(result.stderr, /evil.invalid/);
    });
  }
  test('bootstrap dispatches the fixed model acquisition and reports no release approval', async () => {
    let options; let output;
    const code = await m.runCli(['--bootstrap', '--output', 'new'], {
      acquire: async (value) => { options = value; return { model_id: 'sigsep/umxhq', release_admitted: false }; },
      stdout: (value) => { output = JSON.parse(value); }, stderr: () => assert.fail(),
    });
    assert.equal(code, 0); assert.equal(options.bootstrap, true); assert.equal(options.output, 'new');
    assert.equal(output.release_admitted, false);
  });
  test('pin mode reads supplied receipt rather than computing pins on arbitrary local weights', async () => {
    let options;
    assert.equal(await m.runCli(['--pin', 'reviewed.json', '--output', 'new'], {
      loadPin: async (file) => { assert.equal(file, 'reviewed.json'); return Buffer.from('{"proof":"independently supplied"}'); },
      acquire: async (value) => { options = value; return { model_id: 'sigsep/umxhq', release_admitted: false }; },
      stdout: () => {}, stderr: () => assert.fail(),
    }), 0);
    assert.equal(options.pins.proof, 'independently supplied');
    assert.equal(options.bootstrap, false);
  });
  test('invalid pin JSON fails before acquisition', async () => {
    const code = await m.runCli(['--pin', 'x', '--output', 'new'], {
      loadPin: async () => Buffer.from('not JSON'), acquire: () => assert.fail(), stdout: () => assert.fail(), stderr: () => {},
    });
    assert.equal(code, 1);
  });
  test('unexpected diagnostics are redacted', async () => {
    let diagnostic;
    const code = await m.runCli(['--bootstrap', '--output', 'new'], {
      acquire: async () => { throw Error('/home/private_user/secret-key'); }, stdout: () => assert.fail(), stderr: (line) => { diagnostic = line; },
    });
    assert.equal(code, 1); assert.equal(diagnostic, 'model_download_failed: acquisition_failed');
  });
  test('cancellation is forwarded and handlers are removed', async () => {
    const before = process.listenerCount('SIGINT'); let signal;
    const code = await m.runCli(['--bootstrap', '--output', 'new'], {
      acquire: async (options) => { signal = options.signal; process.emit('SIGINT'); assert.equal(signal.aborted, true); throw Error('cancelled'); },
      stdout: () => assert.fail(), stderr: () => {},
    });
    assert.equal(code, 130); assert.equal(process.listenerCount('SIGINT'), before);
  });
  test('in-process argument errors and help never dispatch acquisition', async () => {
    const options = { acquire: () => assert.fail(), stdout: () => {}, stderr: () => {} };
    assert.equal(await m.runCli([], options), 2);
    assert.equal(await m.runCli(['--help'], options), 0);
  });
  test('module-only import with no argv entry has no side effects', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(target.href)})`], { encoding: 'utf8' });
    assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  });
}
