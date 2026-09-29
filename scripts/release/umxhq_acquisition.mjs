/** Distribution build tooling only: acquired bytes never imply release admission. */
import https from 'node:https';
import { rootCertificates } from 'node:tls';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

export const MODEL_ID = 'sigsep/umxhq';
export const MODEL_RECORD = '10.5281/zenodo.3370489';
export const RECORD_URL = 'https://zenodo.org/api/records/3370489';
export const NOTICE_URL = 'https://raw.githubusercontent.com/sigsep/open-unmix-pytorch/814f144e34b2d1ed517eb605ce928dcb838abbed/LICENSE';
export const NOTICE_SHA256 = '4f7b047ffafb9fbb39a40d605bab961b9b030711addce6e9d23886c2ae3b105e';
export const MAX_WEIGHT_BYTES = 64 * 1024 * 1024;
export const MAX_RECORD_BYTES = 1024 * 1024;
export const FILENAMES = Object.freeze({
  vocals: 'vocals-b62c91ce.pth', bass: 'bass-8d85a5bd.pth',
  drums: 'drums-9619578f.pth', other: 'other-b52fbbf7.pth',
});
const RECEIPT_KIND = 'candidate_acquisition_receipt_not_release_manifest';
const weightUrl = (name) => `https://zenodo.org/records/3370489/files/${name}?download=1`;
const SOURCES = new Set([RECORD_URL, NOTICE_URL, ...Object.values(FILENAMES).map(weightUrl)]);
const digest = (data) => createHash('sha256').update(data).digest('hex');
const cancelled = (signal) => { if (signal?.aborted) throw Error('cancelled'); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validSize = (value) => Number.isSafeInteger(value) && value > 0 && value <= MAX_WEIGHT_BYTES;
const decodeJson = (bytes) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

/** No URL supplied by remote metadata can reach this transport. */
export async function fetchSource(url, { signal } = {}) {
  cancelled(signal);
  if (!SOURCES.has(url)) throw Error('source_rejected');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('tls_environment_rejected');
  return new Promise((resolve, reject) => {
    try {
      const request = https.get(url, {
        agent: false, rejectUnauthorized: true, ca: rootCertificates, minVersion: 'TLSv1.2',
        maxHeaderSize: 16384, signal,
        headers: { 'accept-encoding': 'identity', 'user-agent': 'BandScope-model-acquisition/1' },
      }, resolve);
      request.on('error', () => reject(Error(signal?.aborted ? 'cancelled' : 'network_failed')));
    } catch {
      reject(Error('network_failed'));
    }
  });
}

/** Bound raw bytes before a sink sees them; never follow or decompress responses. */
export async function readResponse(response, { limit, expectedSize = null, signal, sink = null }) {
  let size = 0; const chunks = [];
  try {
    cancelled(signal);
    const headers = response.headers;
    if (response.statusCode !== 200 || !object(headers)
      || (headers['content-encoding'] !== undefined && headers['content-encoding'] !== 'identity')
      || headers.location !== undefined
      || (headers['content-type'] !== undefined && (typeof headers['content-type'] !== 'string'
        || !/^(application\/(octet-stream|json)|text\/plain)(;|$)/i.test(headers['content-type'])))) {
      throw Error('response_rejected');
    }
    const length = headers['content-length'];
    if (length !== undefined && (typeof length !== 'string' || !/^(0|[1-9][0-9]*)$/.test(length)
      || !Number.isSafeInteger(Number(length)) || Number(length) > limit
      || (expectedSize !== null && Number(length) !== expectedSize))) throw Error('response_rejected');
    for await (const chunk of response) {
      cancelled(signal);
      if (!Buffer.isBuffer(chunk)) throw Error('response_rejected');
      size += chunk.length;
      if (size > limit || (expectedSize !== null && size > expectedSize)) throw Error('size_mismatch');
      if (sink) await sink(chunk); else chunks.push(chunk);
    }
    cancelled(signal);
    if ((expectedSize !== null && size !== expectedSize)
      || (length !== undefined && size !== Number(length))) throw Error('size_mismatch');
    return sink ? size : Buffer.concat(chunks, size);
  } catch (error) {
    if (['cancelled', 'response_rejected', 'size_mismatch'].includes(error.message)) throw error;
    throw Error('transfer_failed');
  } finally { response.destroy(); }
}

/** Select only the original four targets; publisher URLs and extra archives are ignored. */
export function parseRecord(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX_RECORD_BYTES) throw Error();
    const record = decodeJson(bytes);
    if (record.id !== 3370489 || record.metadata?.doi !== MODEL_RECORD
      || record.metadata?.version !== '1.0.1' || record.metadata?.license?.id !== 'mit-license'
      || !Array.isArray(record.files)) throw Error();
    return Object.entries(FILENAMES).map(([stem, filename]) => {
      const matches = record.files.filter((entry) => entry?.key === filename);
      if (matches.length !== 1) throw Error();
      const entry = matches[0];
      if (!validSize(entry.size) || typeof entry.checksum !== 'string'
        || !/^md5:[0-9a-f]{32}$/.test(entry.checksum)) throw Error();
      return { stem, filename, size_bytes: entry.size, md5: entry.checksum.slice(4), source_url: weightUrl(filename) };
    });
  } catch { throw Error('record_rejected'); }
}

/** Snapshot independently reviewed pins before making requests; never admit a release. */
export function validatePins(pins) {
  try {
    if (!object(pins) || pins.record_kind !== RECEIPT_KIND || pins.release_admitted !== false
      || pins.model_id !== MODEL_ID || pins.model_record !== MODEL_RECORD || pins.model_version !== '1.0.1'
      || !object(pins.checkpoints) || Object.keys(pins.checkpoints).length !== 4) throw Error();
    return Object.fromEntries(Object.entries(FILENAMES).map(([stem, filename]) => {
      const pin = pins.checkpoints[stem];
      if (!object(pin) || pin.filename !== filename || !validSize(pin.size_bytes)
        || typeof pin.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(pin.sha256)) throw Error();
      return [stem, { filename, size_bytes: pin.size_bytes, sha256: pin.sha256 }];
    }));
  } catch { throw Error('pins_rejected'); }
}

/** Use one non-link regular descriptor and a bounded read for local pin input. */
export async function readPinFile(filename) {
  let handle;
  try {
    const before = await fs.lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_RECORD_BYTES || before.nlink !== 1) throw Error();
    handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw Error();
    const chunks = []; let length = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      length += chunk.length;
      if (length > MAX_RECORD_BYTES || length > opened.size) throw Error();
      chunks.push(chunk);
    }
    const after = await handle.stat();
    if (length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw Error();
    return Buffer.concat(chunks, length);
  } catch { throw Error('pin_file_rejected'); }
  finally { if (handle) await handle.close(); }
}

/** Check our private acquisition directory, not arbitrary content discovered remotely. */
async function checkDirectory(directory, identity) {
  const current = await fs.lstat(directory);
  if (!current.isDirectory() || current.isSymbolicLink()
    || current.dev !== identity.dev || current.ino !== identity.ino) throw Error('directory_changed');
}

/** Publish a completed file without replacing any existing path. */
async function publishFile(directory, identity, filename, write) {
  await checkDirectory(directory, identity);
  const partial = path.join(directory, `${filename}.part`); const final = path.join(directory, filename);
  const handle = await fs.open(partial, 'wx', 0o600);
  try {
    await write(handle);
    await handle.sync();
    const opened = await handle.stat(); const current = await fs.lstat(partial);
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1
      || current.dev !== opened.dev || current.ino !== opened.ino || current.size !== opened.size) throw Error('file_changed');
    await checkDirectory(directory, identity);
    await fs.link(partial, final);
  } finally { await handle.close(); }
  await fs.unlink(partial);
}

/** Explicit build/qualification acquisition, never called by ordinary audio analysis. */
export async function acquireUmxhq({ output, bootstrap = false, pins = null, signal, source = fetchSource }) {
  if ((bootstrap !== true && pins === null) || (bootstrap === true && pins !== null)) throw Error('mode_required');
  const expected = pins === null ? null : validatePins(pins);
  cancelled(signal);
  const requested = path.resolve(output);
  const directory = path.join(await fs.realpath(path.dirname(requested)), path.basename(requested));
  try { await fs.mkdir(directory, { mode: 0o700 }); }
  catch (error) { throw Error(error.code === 'EEXIST' ? 'destination_exists' : 'destination_unavailable'); }
  const identity = await fs.lstat(directory);
  const writeBytes = (name, bytes) => publishFile(directory, identity, name, (handle) => handle.writeFile(bytes));
  // Failed or interrupted acquisitions intentionally remain inspectable but never loadable.
  await fs.writeFile(path.join(directory, 'INCOMPLETE'), 'Not a model release. Do not load.\n', { flag: 'wx', mode: 0o600 });
  const rawRecord = await readResponse(await source(RECORD_URL, { signal }), { limit: MAX_RECORD_BYTES, signal });
  const descriptors = parseRecord(rawRecord);
  if (expected && descriptors.some((d) => d.size_bytes !== expected[d.stem].size_bytes)) throw Error('pinned_size_mismatch');
  await writeBytes('zenodo-record.json', rawRecord);
  const notice = await readResponse(await source(NOTICE_URL, { signal }), { limit: 16 * 1024, signal });
  if (digest(notice) !== NOTICE_SHA256) throw Error('notice_mismatch');
  await writeBytes('LICENSE.openunmix', notice);
  const checkpoints = {};
  for (const descriptor of descriptors) {
    cancelled(signal);
    const sha256 = createHash('sha256'); const md5 = createHash('md5'); let count = 0;
    await publishFile(directory, identity, descriptor.filename, async (handle) => {
      count = await readResponse(await source(descriptor.source_url, { signal }), {
        limit: MAX_WEIGHT_BYTES, expectedSize: descriptor.size_bytes, signal,
        sink: async (chunk) => { await handle.writeFile(chunk); sha256.update(chunk); md5.update(chunk); },
      });
      const fullDigest = sha256.digest('hex');
      if (md5.digest('hex') !== descriptor.md5) throw Error('checksum_mismatch');
      if (expected && fullDigest !== expected[descriptor.stem].sha256) throw Error('sha256_mismatch');
      checkpoints[descriptor.stem] = { filename: descriptor.filename, size_bytes: count, sha256: fullDigest,
        publisher_md5: descriptor.md5, source_url: descriptor.source_url };
    });
  }
  const receipt = {
    schema_version: 1, record_kind: RECEIPT_KIND, model_id: MODEL_ID, model_record: MODEL_RECORD,
    model_version: '1.0.1', release_admitted: false,
    verification_mode: expected ? 'sha256_pinned_reacquisition' : 'publisher_checksum_bootstrap',
    acquired_at: new Date().toISOString(), node_version: process.version,
    rights_evidence: { source_url: RECORD_URL, filename: 'zenodo-record.json', sha256: digest(rawRecord),
      weights_license: 'MIT', separate_oem_contract_required: false },
    notice: { source_url: NOTICE_URL, filename: 'LICENSE.openunmix', sha256: NOTICE_SHA256 }, checkpoints,
  };
  cancelled(signal);
  await writeBytes('acquisition-receipt.json', `${JSON.stringify(receipt, null, 2)}\n`);
  await checkDirectory(directory, identity);
  await fs.unlink(path.join(directory, 'INCOMPLETE'));
  return receipt;
}
