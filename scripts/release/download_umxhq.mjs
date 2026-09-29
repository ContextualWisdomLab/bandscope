/** Explicit Distribution acquisition command; importing this module performs no I/O. */
import process from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireUmxhq, readPinFile } from './umxhq_acquisition.mjs';

const USAGE = 'Usage: node scripts/release/download_umxhq.mjs (--bootstrap | --pin RECEIPT.json) --output NEW_DIRECTORY\n'
  + 'Acquires only UMX-HQ candidate weights. No model is installed or approved for release.\n';
const SAFE_ERRORS = new Set(['cancelled', 'source_rejected', 'tls_environment_rejected', 'network_failed',
  'response_rejected', 'size_mismatch', 'transfer_failed', 'record_rejected', 'pins_rejected',
  'pin_file_rejected', 'directory_changed', 'file_changed', 'mode_required', 'destination_exists',
  'destination_unavailable', 'pinned_size_mismatch', 'notice_mismatch', 'checksum_mismatch', 'sha256_mismatch']);

/** Unknown, duplicate or incomplete options cannot authorize network acquisition. */
export function parseArguments(args) {
  if (args.length === 1 && args[0] === '--help') return null;
  const parsed = { bootstrap: false, pin: null, output: null }; const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (seen.has(key) || !['--bootstrap', '--pin', '--output'].includes(key)) throw Error('arguments_rejected');
    seen.add(key);
    if (key === '--bootstrap') parsed.bootstrap = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw Error('arguments_rejected');
      parsed[key.slice(2)] = value;
    }
  }
  if (!parsed.output || parsed.bootstrap === (parsed.pin !== null)) throw Error('arguments_rejected');
  return parsed;
}

/** A successful acquisition is not a release, model load, or scientific acceptance. */
export async function runCli(args, { acquire = acquireUmxhq, loadPin = readPinFile,
  stdout = console.log, stderr = console.error } = {}) {
  let parsed;
  try { parsed = parseArguments(args); }
  catch { stderr(USAGE); return 2; }
  if (parsed === null) { stdout(USAGE); return 0; }
  const controller = new AbortController(); const abort = () => controller.abort();
  process.on('SIGINT', abort); process.on('SIGTERM', abort);
  try {
    const pins = parsed.pin === null ? null : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await loadPin(parsed.pin)));
    const receipt = await acquire({ output: parsed.output, bootstrap: parsed.bootstrap, pins, signal: controller.signal });
    stdout(JSON.stringify({ status: 'acquired', model_id: receipt.model_id,
      receipt_filename: 'acquisition-receipt.json', release_admitted: false }));
    return 0;
  } catch (error) {
    const code = SAFE_ERRORS.has(error.message) ? error.message : 'acquisition_failed';
    stderr(`model_download_failed: ${code}`);
    return code === 'cancelled' ? 130 : 1;
  } finally { process.off('SIGINT', abort); process.off('SIGTERM', abort); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
