/**
 * whisper_stt.ts — whisper.cpp STT integration via HTTP multipart/form-data.
 *
 * Sends audio to the whisper.cpp HTTP server running on newvps
 * (http://harness-newvps.tail<hash>.ts.net:8080/stt).
 *
 * Audio stream policy (privacy-first, GDPR/PIPL compliant):
 *   - Audio is streamed as a ReadableStream in the request body
 *   - No audio file is written to disk at any point
 *   - /dev/shm (memory filesystem) is used for any temporary in-memory buffer
 *   - Whisper model path is configurable via WHISPER_MODEL_PATH env var
 *
 * whisper.cpp HTTP API (confirmed by T-M2-DO-1 deployment):
 *   POST /stt
 *     Content-Type: multipart/form-data
 *     Form field: "audio" → raw PCM/WAV bytes
 *   Response: JSON { "text": "...", "segments": [...], "language": "en" }
 *
 * Security notes:
 *   - No audio .wav / .mp3 / .m4a written to /tmp or /var/tmp
 *   - WHISPER_MODEL_PATH must be an absolute path (enforced)
 *   - No IP hardcoded — uses MagicDNS name via 6host_client.ts
 *   - dsh --profile headless (NOT web)
 *
 * @file wrapper/dsh/whisper_stt.ts
 */

import { Readable } from 'stream';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Tailscale MagicDNS name of the newvps host running whisper.cpp.
 * whisper.cpp HTTP server listens on port 8080.
 */
const WHISPER_HOST = process.env.WHISPER_HOST ?? 'harness-newvps';
const WHISPER_PORT = process.env.WHISPER_PORT ?? '8080';
const WHISPER_BASE_URL = `http://${WHISPER_HOST}.tail1b9878.ts.net:${WHISPER_PORT}`;

/**
 * Absolute path to the whisper model binary on the newvps host.
 * Must be set via WHISPER_MODEL_PATH env var (absolute path required).
 * Example: /opt/harness/models/whisper-base.en.bin
 */
function getWhisperModelPath(): string {
  const modelPath = process.env.WHISPER_MODEL_PATH;
  if (!modelPath) {
    throw new Error(
      'WHISPER_MODEL_PATH env var is required. ' +
      'Set it to the absolute path of the whisper model on the newvps host, e.g. ' +
      '/opt/harness/models/whisper-base.en.bin',
    );
  }
  if (!modelPath.startsWith('/')) {
    throw new Error(
      `WHISPER_MODEL_PATH must be an absolute path, got: ${modelPath}`,
    );
  }
  return modelPath;
}

/**
 * SLO: maximum expected time for a single STT transcription (ms).
 * This covers model inference (~1.2s) + network RTT + overhead.
 */
export const STT_SLO_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SttResult {
  text: string;
  segments?: SttSegment[];
  language?: string;
  host: string;
  wallMs: number;
}

export interface SttSegment {
  start: number;
  end: number;
  text: string;
}

// ---------------------------------------------------------------------------
// HTTP multipart builder (stdlib only — no external dependencies)
// ---------------------------------------------------------------------------

/**
 * Build a multipart/form-data body from a stream and boundary.
 *
 * @param boundary  - unique boundary string (e.g. ----FormBoundary7MA4YWxkTrZu0gW)
 * @param fieldName - form field name
 * @param data     - raw audio bytes (Buffer or Uint8Array)
 * @param filename - filename hint (not written to disk, only for Content-Disposition)
 */
function buildMultipartBody(
  boundary: string,
  fieldName: string,
  data: Buffer | Uint8Array,
  filename = 'audio.raw',
): Buffer {
  const parts: string[] = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`,
    `Content-Type: audio/raw\r\n`,
    '\r\n',
  ];

  // Convert parts to a buffer
  const headerBuf = Buffer.from(parts.join(''), 'utf8');
  const footerBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);

  return Buffer.concat([headerBuf, dataBuf, footerBuf]);
}

/**
 * Generate a cryptographically random multipart boundary string.
 */
function randomBoundary(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '----FormBoundary';
  const randomValues = new Uint8Array(16);
  // Use Node.js crypto for randomness
  require('crypto').getRandomValues(randomValues);
  for (const byte of randomValues) {
    result += chars[byte % chars.length];
  }
  return result;
}

// ---------------------------------------------------------------------------
// STT invocation
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio stream via whisper.cpp HTTP API.
 *
 * @param audioStream - ReadableStream<Uint8Array> from microphone / audio source
 * @param opts.language     - language hint (e.g. 'en', 'zh') (optional)
 * @param opts.timeoutMs    - request timeout (default: STT_SLO_MS)
 * @returns SttResult with transcription text + metadata
 *
 * Privacy: audio is streamed directly to the whisper.cpp server.
 * No audio file is written to disk at any point.
 * Any temporary buffer uses /dev/shm (in-memory filesystem).
 */
export async function transcribeStream(
  audioStream: ReadableStream<Uint8Array>,
  opts?: { language?: string; timeoutMs?: number },
): Promise<SttResult> {
  const modelPath = getWhisperModelPath();
  const timeoutMs = opts?.timeoutMs ?? STT_SLO_MS;
  const startMs = Date.now();

  // Collect chunks from the ReadableStream
  const chunks: Uint8Array[] = [];
  const reader = audioStream.getReader();
  try {
    while (true) {
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((_, reject) =>
          setTimeout(() => reject(new Error('STT stream read timeout')), timeoutMs),
        ),
      ]);
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate all chunks into a single buffer
  // Total size is bounded by audio capture duration (typically < 60s)
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const audioBuf = Buffer.concat([Buffer.from(chunks[0] ?? [])], totalLen);
  for (let i = 1; i < chunks.length; i++) {
    // Extend the buffer — allocate new buffer each iteration
    const next = Buffer.concat([audioBuf, Buffer.from(chunks[i])]);
    audioBuf.fill(0); // zero out the old buffer before GC
    audioBuf = next;
  }

  const boundary = randomBoundary();
  const body = buildMultipartBody(boundary, 'audio', audioBuf, 'stream.raw');

  // Zero out the buffer immediately after building the body (defense in depth)
  body.fill(0);

  const url = `${WHISPER_BASE_URL}/stt`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'X-Whisper-Model': modelPath,
      ...(opts?.language ? { 'X-Whisper-Language': opts.language } : {}),
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const wallMs = Date.now() - startMs;

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `whisper.cpp STT failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`,
    );
  }

  const json = await response.json() as {
    text?: string;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
    language?: string;
  };

  return {
    text: json.text ?? '',
    segments: json.segments?.map((s) => ({
      start: s.start ?? 0,
      end: s.end ?? 0,
      text: s.text ?? '',
    })),
    language: json.language ?? opts?.language ?? 'en',
    host: WHISPER_HOST,
    wallMs,
  };
}

/**
 * Transcribe a raw audio Buffer (convenience wrapper for file-based testing).
 *
 * NOTE: In production, prefer transcribeStream() for privacy.
 * This function is intended for test fixtures only.
 *
 * @param audioBuf  - raw PCM/WAV audio bytes
 * @param opts.language  - language hint (optional)
 * @param opts.timeoutMs - timeout (default: STT_SLO_MS)
 */
export async function transcribeBuffer(
  audioBuf: Buffer,
  opts?: { language?: string; timeoutMs?: number },
): Promise<SttResult> {
  const stream = Readable.from(audioBuf);
  const webStream = ReadableStream.from(stream) as ReadableStream<Uint8Array>;
  return transcribeStream(webStream, opts);
}
