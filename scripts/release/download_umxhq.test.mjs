/** Download contracts use transport fixtures, never model-quality evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import https from 'node:https';
import { EventEmitter } from 'node:events';

const implementation = new URL('./umxhq_acquisition.mjs', import.meta.url);
test('the explicit acquisition implementation exists', () => assert.ok(existsSync(implementation)));
if (existsSync(implementation)) {
  const m = await import(implementation);
  const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
  const body = (bytes, headers = {}, statusCode = 200) => Object.assign(
    Readable.from([Buffer.from(bytes)]), { statusCode, headers },
  );
  const fixture = () => {
    const weights = Object.fromEntries(Object.entries(m.FILENAMES).map(([stem, name]) => [name, Buffer.from(`UNIT CHECKPOINT ${stem}`)]));
    const record = {
      id: 3370489,
      metadata: { doi: m.MODEL_RECORD, version: '1.0.1', license: { id: 'mit-license' } },
      files: Object.entries(weights).map(([key, value]) => ({ key, size: value.length, checksum: `md5:${hash(value, 'md5')}`, links: { self: 'https://evil.invalid/ignored' } })),
    };
    record.files.push({ key: 'training-json-logs.zip', size: 42 });
    return { weights, record };
  };
  const withWorkspace = async (t) => {
    const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'umxhq-unit-')));
    t.after(() => fs.rm(parent, { recursive: true, force: true }));
    return { parent, output: path.join(parent, 'new-bundle') };
  };
  const transport = (data, calls = []) => async (url) => {
    calls.push(url);
    if (url === m.RECORD_URL) return body(JSON.stringify(data.record), { 'content-type': 'application/json' });
    if (url === m.NOTICE_URL) return body(await fs.readFile(new URL('./fixtures/openunmix-LICENSE.txt', import.meta.url)));
    const filename = new URL(url).pathname.split('/').at(-1);
    assert.ok(filename in data.weights);
    return body(data.weights[filename], { 'content-length': String(data.weights[filename].length) });
  };

  test('bootstrap downloads all four fixed files, exact notice and a non-release receipt', async (t) => {
    const { output } = await withWorkspace(t); const data = fixture(); const calls = [];
    const receipt = await m.acquireUmxhq({ output, bootstrap: true, source: transport(data, calls) });
    assert.equal(receipt.release_admitted, false);
    assert.equal(receipt.record_kind, 'candidate_acquisition_receipt_not_release_manifest');
    assert.equal(receipt.verification_mode, 'publisher_checksum_bootstrap');
    assert.deepEqual(Object.keys(receipt.checkpoints), Object.keys(m.FILENAMES));
    for (const [stem, name] of Object.entries(m.FILENAMES)) {
      assert.deepEqual(await fs.readFile(path.join(output, name)), data.weights[name]);
      assert.equal(receipt.checkpoints[stem].sha256, hash(data.weights[name]));
      assert.equal(receipt.checkpoints[stem].size_bytes, data.weights[name].length);
    }
    assert.equal(calls.length, 6);
    assert.ok(calls.every((url) => !url.includes('evil.invalid') && !url.includes('.zip')));
    assert.equal(existsSync(path.join(output, 'INCOMPLETE')), false);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, 'acquisition-receipt.json'), 'utf8')), receipt);
  });

  test('reviewed full SHA256 pins permit a separate reproducible acquisition', async (t) => {
    const { parent, output } = await withWorkspace(t); const data = fixture();
    const first = await m.acquireUmxhq({ output, bootstrap: true, source: transport(data) });
    const receipt = await m.acquireUmxhq({ output: path.join(parent, 'pinned'), pins: first, source: transport(data) });
    assert.equal(receipt.verification_mode, 'sha256_pinned_reacquisition');
    assert.deepEqual(receipt.checkpoints, first.checkpoints);
  });

  test('changed bytes cannot pass full SHA256 pins even when the publisher MD5 changes too', async (t) => {
    const { parent, output } = await withWorkspace(t); const data = fixture();
    const pins = await m.acquireUmxhq({ output, bootstrap: true, source: transport(data) });
    const name = m.FILENAMES.vocals; data.weights[name] = Buffer.alloc(data.weights[name].length, 1);
    data.record.files.find((f) => f.key === name).checksum = `md5:${hash(data.weights[name], 'md5')}`;
    const target = path.join(parent, 'changed');
    await assert.rejects(m.acquireUmxhq({ output: target, pins, source: transport(data) }), /sha256_mismatch/);
    assert.equal(existsSync(path.join(target, 'acquisition-receipt.json')), false);
  });

  for (const [name, change] of [
    ['wrong record', (x) => { x.id = 3370486; }],
    ['wrong DOI', (x) => { x.metadata.doi = 'other'; }],
    ['wrong version', (x) => { x.metadata.version = '2'; }],
    ['noncommercial model', (x) => { x.metadata.license.id = 'cc-by-nc-sa-4.0'; }],
    ['missing target', (x) => { x.files.shift(); }],
    ['duplicate target', (x) => { x.files.push(x.files[0]); }],
    ['over-limit artifact', (x) => { x.files[0].size = m.MAX_WEIGHT_BYTES + 1; }],
    ['empty artifact', (x) => { x.files[0].size = 0; }],
    ['fractional size', (x) => { x.files[0].size = 1.5; }],
    ['boolean size', (x) => { x.files[0].size = true; }],
    ['malformed checksum', (x) => { x.files[0].checksum = 'md5:xx'; }],
  ]) {
    test(`publisher metadata rejects ${name}`, () => {
      const data = fixture(); change(data.record);
      assert.throws(() => m.parseRecord(Buffer.from(JSON.stringify(data.record))), /record_rejected/);
    });
  }
  test('metadata is byte-bounded and must be JSON', () => {
    assert.throws(() => m.parseRecord(Buffer.alloc(m.MAX_RECORD_BYTES + 1)), /record_rejected/);
    assert.throws(() => m.parseRecord(Buffer.from('<html>')), /record_rejected/);
  });
  for (const mutation of [
    (p) => { p.model_id = 'sigsep/umxl'; },
    (p) => { p.release_admitted = true; },
    (p) => { delete p.checkpoints.other; },
    (p) => { p.checkpoints.vocals.filename = '../model.pth'; },
    (p) => { p.checkpoints.vocals.sha256 = null; },
    (p) => { p.checkpoints.vocals.size_bytes = -1; },
  ]) {
    test('malformed pins are rejected before any HTTP or output write', async (t) => {
      const { output } = await withWorkspace(t); const data = fixture();
      const p = { record_kind: 'candidate_acquisition_receipt_not_release_manifest', model_id: m.MODEL_ID, model_record: m.MODEL_RECORD, model_version: '1.0.1', release_admitted: false, checkpoints: Object.fromEntries(Object.entries(m.FILENAMES).map(([s, f]) => [s, { filename: f, size_bytes: data.weights[f].length, sha256: hash(data.weights[f]) }])) };
      mutation(p);
      await assert.rejects(m.acquireUmxhq({ output, pins: p, source: () => assert.fail('HTTP reached') }), /pins_rejected/);
      assert.equal(existsSync(output), false);
    });
  }
  test('bootstrap is explicit and mutually exclusive with pins', async (t) => {
    const { output } = await withWorkspace(t);
    await assert.rejects(m.acquireUmxhq({ output }), /mode_required/);
    await assert.rejects(m.acquireUmxhq({ output, bootstrap: true, pins: {} }), /mode_required/);
    assert.equal(existsSync(output), false);
  });
  test('existing directory is never overwritten or reused', async (t) => {
    const { output } = await withWorkspace(t); await fs.mkdir(output); await fs.writeFile(path.join(output, 'keep'), 'original');
    await assert.rejects(m.acquireUmxhq({ output, bootstrap: true, source: () => assert.fail('HTTP reached') }), /destination_exists/);
    assert.equal(await fs.readFile(path.join(output, 'keep'), 'utf8'), 'original');
  });
  test('symlink destination is rejected before HTTP', async (t) => {
    const { parent, output } = await withWorkspace(t); await fs.symlink(parent, output, 'junction');
    await assert.rejects(m.acquireUmxhq({ output, bootstrap: true, source: () => assert.fail('HTTP reached') }), /destination_exists/);
  });
  test('pre-cancelled work creates nothing', async (t) => {
    const { output } = await withWorkspace(t);
    await assert.rejects(m.acquireUmxhq({ output, bootstrap: true, signal: AbortSignal.abort() }), /cancelled/);
    assert.equal(existsSync(output), false);
  });
  for (const [label, modify] of [
    ['truncation', (bytes) => bytes.subarray(0, -1)],
    ['extra bytes', (bytes) => Buffer.concat([bytes, Buffer.from('x')])],
    ['same-size corruption', (bytes) => Buffer.alloc(bytes.length, 1)],
  ]) {
    test(`${label} leaves an incomplete bundle and no success receipt`, async (t) => {
      const { output } = await withWorkspace(t); const data = fixture(); const original = transport(data);
      const source = async (url) => url.includes('.pth') ? body(modify(data.weights[new URL(url).pathname.split('/').at(-1)])) : original(url);
      await assert.rejects(m.acquireUmxhq({ output, bootstrap: true, source }), /size_mismatch|checksum_mismatch/);
      assert.equal(existsSync(path.join(output, 'INCOMPLETE')), true);
      assert.equal(existsSync(path.join(output, 'acquisition-receipt.json')), false);
    });
  }
  for (const [label, headers, status] of [
    ['redirect', { location: 'https://evil.invalid' }, 302],
    ['partial response', {}, 206],
    ['rate limiting', {}, 429],
    ['compression', { 'content-encoding': 'gzip' }, 200],
    ['HTML error', { 'content-type': 'text/html' }, 200],
    ['inconsistent length', { 'content-length': '99' }, 200],
    ['ambiguous length', { 'content-length': ['4', '4'] }, 200],
  ]) {
    test(`HTTP ${label} cannot be accepted as a checkpoint`, async () => {
      const response = body('test', headers, status);
      await assert.rejects(m.readResponse(response, { limit: 16, expectedSize: 4 }), /response_rejected|size_mismatch/);
      assert.equal(response.destroyed, true);
    });
  }
  test('network stream failure and cancellation close a partial response', async () => {
    const controller = new AbortController();
    const response = Object.assign(Readable.from((async function* () { yield Buffer.from('one'); controller.abort(); yield Buffer.from('two'); })()), { statusCode: 200, headers: {} });
    await assert.rejects(m.readResponse(response, { limit: 16, signal: controller.signal }), /cancelled/);
    const failed = Object.assign(Readable.from((async function* () { yield Buffer.from('x'); throw Error('network secret'); })()), { statusCode: 200, headers: {} });
    await assert.rejects(m.readResponse(failed, { limit: 16 }), /transfer_failed/);
  });
  test('bounded responses enforce total size without Content-Length', async () => {
    await assert.rejects(m.readResponse(body('12345'), { limit: 4 }), /size_mismatch/);
  });
  test('fixed URL allowlist rejects alternate models, credentials, ports and schemes', async () => {
    for (const url of ['http://zenodo.org/api/records/3370489', 'https://localhost/x', 'https://zenodo.org:444/api/records/3370489', 'https://u:p@zenodo.org/api/records/3370489', 'https://zenodo.org/api/records/3370486', 'https://zenodo.org/api/records/3370489#x']) {
      await assert.rejects(m.fetchSource(url), /source_rejected/);
    }
  });
  test('native transport fixes TLS verification, no shared agent, no redirects or credentials', async (t) => {
    const response = body('{}', { 'content-type': 'application/json' }); let options;
    t.mock.method(https, 'get', (url, opts, cb) => { options = opts; const request = new EventEmitter(); queueMicrotask(() => cb(response)); return request; });
    assert.equal(await m.fetchSource(m.RECORD_URL), response);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.agent, false);
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers['accept-encoding'], 'identity');
    assert.ok(options.ca.length > 0);
  });
  test('native transport hides low-level connection diagnostics', async (t) => {
    t.mock.method(https, 'get', () => { const request = new EventEmitter(); queueMicrotask(() => request.emit('error', Error('secret private proxy'))); return request; });
    await assert.rejects(m.fetchSource(m.RECORD_URL), /^Error: network_failed$/);
  });
  test('local pin reader rejects links and reads bounded regular receipt bytes', async (t) => {
    const { parent } = await withWorkspace(t); const file = path.join(parent, 'pin.json'); await fs.writeFile(file, '{}');
    assert.equal((await m.readPinFile(file)).toString(), '{}');
    const link = path.join(parent, 'pin-link'); await fs.symlink(file, link);
    await assert.rejects(m.readPinFile(link), /pin_file_rejected/);
    await fs.writeFile(file, Buffer.alloc(m.MAX_RECORD_BYTES + 1));
    await assert.rejects(m.readPinFile(file), /pin_file_rejected/);
  });
  test('TLS-disable environment is rejected before the native request', async (t) => {
    const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    t.after(() => { if (before === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = before; });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    t.mock.method(https, 'get', () => assert.fail('network reached'));
    await assert.rejects(m.fetchSource(m.RECORD_URL), /tls_environment_rejected/);
  });
  test('native synchronous failure is also redacted', async (t) => {
    t.mock.method(https, 'get', () => { throw Error('private detail'); });
    await assert.rejects(m.fetchSource(m.RECORD_URL), /^Error: network_failed$/);
  });
  test('native request abort is cancellation, not an acquisition success', async (t) => {
    const controller = new AbortController();
    t.mock.method(https, 'get', () => { const request = new EventEmitter(); queueMicrotask(() => { controller.abort(); request.emit('error', Error('abort')); }); return request; });
    await assert.rejects(m.fetchSource(m.RECORD_URL, { signal: controller.signal }), /cancelled/);
  });
  test('text-mode chunks are not treated as original binary bytes', async () => {
    const response = Object.assign(Readable.from(['text']), { statusCode: 200, headers: {} });
    await assert.rejects(m.readResponse(response, { limit: 20 }), /response_rejected/);
  });
  test('source notice must match its independently fixed full SHA256', async (t) => {
    const { output } = await withWorkspace(t); const data = fixture(); const original = transport(data);
    await assert.rejects(m.acquireUmxhq({ output, bootstrap: true, source: (url) => url === m.NOTICE_URL ? body('wrong notice') : original(url) }), /notice_mismatch/);
    assert.equal(existsSync(path.join(output, m.FILENAMES.vocals)), false);
  });
  test('publisher size drift fails before fetching any checkpoint', async (t) => {
    const { parent, output } = await withWorkspace(t); const data = fixture();
    const pins = await m.acquireUmxhq({ output, bootstrap: true, source: transport(data) });
    data.record.files[0].size += 1;
    const calls = [];
    await assert.rejects(m.acquireUmxhq({ output: path.join(parent, 'size-drift'), pins, source: transport(data, calls) }), /pinned_size_mismatch/);
    assert.deepEqual(calls, [m.RECORD_URL]);
  });
  test('directory replacement cannot redirect subsequent bundle writes', async (t) => {
    const { parent, output } = await withWorkspace(t); const data = fixture(); const original = transport(data);
    const outside = path.join(parent, 'outside'); await fs.mkdir(outside);
    const source = async (url) => {
      if (url === m.RECORD_URL) { await fs.rename(output, path.join(parent, 'preserved')); await fs.symlink(outside, output, 'junction'); }
      return original(url);
    };
    await assert.rejects(m.acquireUmxhq({ output, bootstrap: true, source }), /directory_changed/);
    assert.deepEqual(await fs.readdir(outside), []);
  });
  test('checkpoint pathname replacement cannot publish different descriptor bytes', async (t) => {
    const { output } = await withWorkspace(t); const data = fixture(); const original = transport(data);
    const source = async (url) => {
      if (url.includes('.pth')) {
        const partial = path.join(output, `${m.FILENAMES.vocals}.part`);
        await fs.rename(partial, `${partial}.preserved`); await fs.writeFile(partial, 'substitute');
      }
      return original(url);
    };
    await assert.rejects(m.acquireUmxhq({ output, bootstrap: true, source }), /file_changed/);
    assert.equal(existsSync(path.join(output, 'acquisition-receipt.json')), false);
  });
  test('non-directory parent fails without a network call', async (t) => {
    const { parent } = await withWorkspace(t); const file = path.join(parent, 'ordinary-file'); await fs.writeFile(file, 'x');
    await assert.rejects(m.acquireUmxhq({ output: path.join(file, 'child'), bootstrap: true, source: () => assert.fail() }), /destination_unavailable/);
  });
  for (const changeAt of [1, 2]) {
    test(`pin descriptor size drift at stat ${changeAt} is rejected`, async (t) => {
      const { parent } = await withWorkspace(t); const file = path.join(parent, 'pin.json'); await fs.writeFile(file, '{}');
      const probe = await fs.open(file, 'r'); const prototype = Object.getPrototypeOf(probe); await probe.close();
      const original = prototype.stat; let count = 0;
      t.mock.method(prototype, 'stat', async function (...args) { const result = await original.apply(this, args); count += 1; if (count === changeAt) result.size += 1; return result; });
      await assert.rejects(m.readPinFile(file), /pin_file_rejected/);
    });
  }
  test('pin growth during descriptor read is bounded', async (t) => {
    const { parent } = await withWorkspace(t); const file = path.join(parent, 'pin.json'); await fs.writeFile(file, '{}');
    const probe = await fs.open(file, 'r'); const prototype = Object.getPrototypeOf(probe); await probe.close();
    t.mock.method(prototype, 'createReadStream', () => Readable.from([Buffer.from('{}extra')]));
    await assert.rejects(m.readPinFile(file), /pin_file_rejected/);
  });
}

test('the existing native Distribution matrix executes the offline acquisition tests', async () => {
  const workflow = await fs.readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const job = workflow.split('  distribution-download-platform:')[1].split('\n  distribution-owned-platform:')[0];
  for (const platform of ['ubuntu-latest', 'windows-2025', 'macos-15']) assert.ok(job.includes(platform));
  assert.ok(job.includes('node --test scripts/release/download_umxhq.test.mjs scripts/release/download_umxhq_cli.test.mjs'));
  assert.ok(job.includes('cargo +stable test'));
  assert.ok(!job.includes('download_umxhq.mjs --bootstrap'));
});
