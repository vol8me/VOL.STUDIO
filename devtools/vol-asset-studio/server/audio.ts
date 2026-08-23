import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AudioMetadata } from '../shared/contracts.js';
import { AssetStudioError } from './errors.js';

interface FfprobeOutput {
  format?: { duration?: string; bit_rate?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    duration?: string;
    bit_rate?: string;
  }>;
}

function optionalPositiveNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function runFfprobe(path: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration,bit_rate:stream=codec_type,codec_name,sample_rate,channels,channel_layout,duration,bit_rate',
        '-of',
        'json',
        '--',
        path,
      ],
      { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: timeoutMs, windowsHide: true },
      (error, stdout) => {
        if (error !== null) reject(error instanceof Error ? error : new Error('ffprobe_failed'));
        else resolve(stdout);
      },
    );
  });
}

function runFfprobeDescriptor(handle: FileHandle, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const descriptorPath = process.platform === 'linux' ? '/proc/self/fd/3' : '/dev/fd/3';
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration,bit_rate:stream=codec_type,codec_name,sample_rate,channels,channel_layout,duration,bit_rate',
        '-of',
        'json',
        descriptorPath,
      ],
      { shell: false, stdio: ['ignore', 'pipe', 'pipe', handle.fd], windowsHide: true },
    );
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finish = (error?: Error, value?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error !== undefined) reject(error);
      else resolve(value ?? '');
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('ffprobe_timeout'));
    }, timeoutMs);
    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    if (stdoutStream === null || stderrStream === null) {
      child.kill('SIGKILL');
      finish(new Error('ffprobe_stdio_missing'));
      return;
    }

    stdoutStream.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 1024 * 1024) {
        child.kill('SIGKILL');
        finish(new Error('ffprobe_output_limit'));
        return;
      }
      stdout.push(chunk);
    });
    stderrStream.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 1024 * 1024) {
        child.kill('SIGKILL');
        finish(new Error('ffprobe_error_output_limit'));
      }
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code === 0) finish(undefined, Buffer.concat(stdout).toString('utf8'));
      else finish(new Error(`ffprobe_exit:${String(code)}`));
    });
  });
}

function parseFfprobe(raw: string): AudioMetadata {
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(raw) as FfprobeOutput;
  } catch (error) {
    throw new AssetStudioError('decode_failed', 422, { kind: 'audio' }, { cause: error });
  }

  const stream = parsed.streams?.find((candidate) => candidate.codec_type === 'audio');
  if (stream?.codec_name === undefined) {
    throw new AssetStudioError('decode_failed', 422, { kind: 'audio' });
  }

  const durationSeconds = optionalPositiveNumber(stream.duration ?? parsed.format?.duration);
  if (durationSeconds === undefined) {
    throw new AssetStudioError('decode_failed', 422, { kind: 'audio' });
  }

  const sampleRate = optionalPositiveNumber(stream.sample_rate);
  const bitRate = optionalPositiveNumber(stream.bit_rate ?? parsed.format?.bit_rate);
  return {
    codec: stream.codec_name,
    durationSeconds,
    ...(sampleRate === undefined ? {} : { sampleRate }),
    ...(stream.channels === undefined ? {} : { channels: stream.channels }),
    ...(stream.channel_layout === undefined ? {} : { channelLayout: stream.channel_layout }),
    ...(bitRate === undefined ? {} : { bitRate }),
  };
}

/** Shell açmadan, sınırlı çıktı ve süreyle temel ses bilgisini okur. */
export async function probeAudio(path: string, timeoutMs = 15_000): Promise<AudioMetadata> {
  try {
    return parseFfprobe(await runFfprobe(path, timeoutMs));
  } catch (error) {
    if (error instanceof AssetStudioError) throw error;
    throw new AssetStudioError('decode_failed', 422, { kind: 'audio' }, { cause: error });
  }
}

/** Doğrulanmış descriptorı child süreçte salt okunur fd olarak ffprobe'a verir. */
export async function probeAudioHandle(
  handle: FileHandle,
  timeoutMs = 15_000,
): Promise<AudioMetadata> {
  if (process.platform === 'win32') {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vol-asset-probe-'));
    const temporaryFile = join(temporaryDirectory, 'asset');
    try {
      await pipeline(
        handle.createReadStream({ autoClose: false }),
        createWriteStream(temporaryFile, { flags: 'wx', mode: 0o600 }),
      );
      return await probeAudio(temporaryFile, timeoutMs);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
  try {
    return parseFfprobe(await runFfprobeDescriptor(handle, timeoutMs));
  } catch (error) {
    if (error instanceof AssetStudioError) throw error;
    throw new AssetStudioError('decode_failed', 422, { kind: 'audio' }, { cause: error });
  }
}
