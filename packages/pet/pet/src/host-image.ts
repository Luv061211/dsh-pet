/** Host-only complete WebP decoding for package publication. */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { PetValidationError } from './runtime.ts'

const SHARP_ENTRY_URL = pathToFileURL(createRequire(import.meta.url).resolve('sharp')).href
const DECODE_SCRIPT = `
import fs from 'node:fs';
import sharp from ${JSON.stringify(SHARP_ENTRY_URL)};
const input = fs.readFileSync(0);
try {
  const result = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  process.stdout.write(JSON.stringify({ width: result.info.width, height: result.info.height }));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
`

/** Decode every pixel in a bounded WebP inside an isolated process.
 * @param bytes - already byte-limited candidate WebP data.
 * @param timeoutMs - positive host-configured decode deadline.
 * @returns dimensions reported by the successful decoder.
 */
export function decodeWebpDimensions(bytes: Uint8Array, timeoutMs: number): { readonly width: number; readonly height: number } {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new PetValidationError('pet spritesheet decode timeout must be positive')
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', DECODE_SCRIPT], {
    input: bytes,
    encoding: 'utf8',
    env: scrubbedParentEnv(),
    maxBuffer: 64 * 1024,
    timeout: timeoutMs,
    windowsHide: true,
  })
  if (result.status !== 0) throw new PetValidationError('pet spritesheet must be a decodable WebP image')
  try {
    const dimensions = JSON.parse(result.stdout) as { width?: unknown; height?: unknown }
    if (!Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height)) throw new Error('invalid decoder result')
    return { width: dimensions.width as number, height: dimensions.height as number }
  } catch {
    throw new PetValidationError('pet spritesheet decoder returned invalid dimensions')
  }
}
