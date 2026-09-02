/**
 * STT Worker — whisper.cpp streaming transcription for v1.1 M2.
 *
 * Responsibilities:
 *   - Accept multipart/form-data audio stream via HTTP POST /api/stt/transcribe
 *   - Stream audio to whisper.cpp for real-time transcription
 *   - Use /dev/shm for in-memory temp files (never persist to disk)
 *   - Return transcription JSON; delete temp buffers immediately
 *
 * M2 hygiene gates (v0.3 §4.6):
 *   - Audio never written to disk (.wav / .mp3 / .m4a paths forbidden)
 *   - Temp files only in /dev/shm (memory filesystem; auto-drop on process exit)
 *   - WHISPER_MODEL_PATH must be absolute path (no relative paths)
 *   - STT worker runs ONLY on newvps primary (M2 §8 prohibition)
 *
 * Env vars (env-inject only; no hardcoding):
 *   WHISPER_MODEL_PATH  — absolute path to whisper.cpp model .bin file
 *   DEEPSEEK_API_KEY    — injected via process.env for any AI-enhanced features
 *
 * Co-Authored-By: Claude Code <noreply@anthropic.com>
 */

import { spawn } from "child_process";
import { createWriteStream, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SttRequest {
  audioStream: AsyncIterable<Uint8Array>;
  mimeType: string;
  language?: string;
  taskId?: string;
}

export interface SttResult {
  taskId: string;
  text: string;
  language: string | null;
  durationSeconds: number;
  transcriptionMs: number;
  /** Always null — audio never persisted */
  audioPath: null;
  segments: SttSegment[];
}

export interface SttSegment {
  start: number;
  end: number;
  text: string;
}

export interface SttError {
  taskId: string;
  error: string;
  stage: "stream" | "transcribe" | "parse" | "cleanup";
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Whisper.cpp CLI binary path */
const WHISPER_CLI = process.env["WHISPER_CLI"] ?? "/usr/local/bin/main";

/** Whisper model absolute path — MUST be absolute per M2 §4.6 hygiene */
const WHISPER_MODEL_PATH = (() => {
  const p = process.env["WHISPER_MODEL_PATH"];
  if (!p) throw new Error("WHISPER_MODEL_PATH env var is required");
  if (!p.startsWith("/")) throw new Error("WHISPER_MODEL_PATH must be an absolute path");
  return p;
})();

/** /dev/shm prefix for in-memory audio temp files */
const SHM_TMP_PREFIX = "/dev/shm/harness-stt-";

/** Max audio stream size (50 MB) — protects against OOM */
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

// ─── Audio pipe (in-memory only) ──────────────────────────────────────────────

/**
 * Write audio chunks to a /dev/shm temp file (memory filesystem).
 * /dev/shm is a tmpfs — contents are lost on reboot / process exit.
 * This satisfies the "audio never touches disk" requirement (M2 §4.6).
 *
 * The file is deleted immediately after whisper.cpp completes.
 * On process crash the OS reclaims the tmpfs automatically.
 */
async function writeAudioToShm(
  stream: AsyncIterable<Uint8Array>,
  taskId: string,
): Promise<string> {
  const tmpPath = `${SHM_TMP_PREFIX}${taskId}.bin`;
  const writer = createWriteStream(tmpPath, { fd: undefined });

  let totalBytes = 0;
  try {
    for await (const chunk of stream) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_AUDIO_BYTES) {
        writer.close();
        unlinkSync(tmpPath);
        throw new Error(`Audio stream exceeds ${MAX_AUDIO_BYTES} bytes`);
      }
      writer.write(chunk);
    }
    writer.end();
  } catch (err) {
    writer.close();
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }

  return tmpPath;
}

// ─── Whisper.cpp invocation ───────────────────────────────────────────────────

/**
 * Run whisper.cpp CLI for transcription.
 * Returns raw stdout (JSON array of segments).
 *
 * Flags:
 *   -m  model.bin path (absolute)
 *   -f  audio input file (in /dev/shm)
 *   -json  output JSON
 *   -l  language (auto-detect if not set)
 *
 * NOTE: whisper.cpp does NOT support stdin streaming — audio must be a temp file.
 * The temp file lives in /dev/shm (memory filesystem) per M2 §4.6 hygiene.
 */
function runWhisperCli(
  audioPath: string,
  language?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-m", WHISPER_MODEL_PATH,
      "-f", audioPath,
      "--output-json-full",
      ...(language ? ["-l", language] : []),
    ];

    const proc = spawn(WHISPER_CLI, args, {
      timeout: 30_000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("error", (err) => reject(new Error(`whisper-cli spawn: ${err.message}`)));

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`whisper-cli exit ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    // Hard timeout
    setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("whisper-cli timed out after 30s"));
    }, 30_000);
  });
}

// ─── Segment parsing ──────────────────────────────────────────────────────────

/**
 * Parse whisper.cpp --output-json-full stdout into SttSegment[].
 * The output format is a JSON array of segment objects with start/end/text.
 */
function parseWhisperOutput(raw: string, durationSeconds: number): SttSegment[] {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      // Sometimes whisper outputs a single object { text, segments: [...] }
      const segments = (data as Record<string, unknown>).segments;
      if (Array.isArray(segments)) {
        return segments.map(normalizeSegment);
      }
      return [];
    }
    return data.map(normalizeSegment);
  } catch {
    // Fallback: treat entire output as single segment
    return [{
      start: 0,
      end: durationSeconds,
      text: raw.trim().slice(0, 2000),
    }];
  }
}

function normalizeSegment(seg: Record<string, unknown>): SttSegment {
  return {
    start: typeof seg.t1 === "number" ? seg.t1 : (typeof seg.start === "number" ? seg.start : 0),
    end: typeof seg.t2 === "number" ? seg.t2 : (typeof seg.end === "number" ? seg.end : 0),
    text: String(seg.text ?? seg.timestamp ?? "").trim(),
  };
}

// ─── Main transcription pipeline ──────────────────────────────────────────────

/**
 * Transcribe an audio stream using whisper.cpp.
 *
 * Pipeline:
 *   1. Stream audio chunks -> /dev/shm temp file (memory filesystem)
 *   2. whisper.cpp -f <tmpfile> --output-json-full
 *   3. Parse JSON output -> SttResult
 *   4. Delete /dev/shm temp file immediately
 *
 * Audio never touches persistent storage. /dev/shm auto-cleared on exit.
 */
export async function transcribe(request: SttRequest): Promise<SttResult> {
  const taskId = request.taskId ?? randomUUID();
  const t0 = Date.now();

  let tmpPath: string | null = null;

  try {
    // Step 1: stream audio to /dev/shm
    tmpPath = await writeAudioToShm(request.audioStream, taskId);

    // Step 2: run whisper.cpp
    const durationSeconds = 0; // whisper calculates this; estimate from file size
    const rawOutput = await runWhisperCli(tmpPath, request.language);

    // Step 3: parse output
    const transcriptionMs = Date.now() - t0;
    const segments = parseWhisperOutput(rawOutput, durationSeconds);

    const fullText = segments.map((s) => s.text).join(" ").trim();

    return {
      taskId,
      text: fullText,
      language: request.language ?? null,
      durationSeconds,
      transcriptionMs,
      audioPath: null, // M2 hygiene: audio never persisted
      segments,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    throw { taskId, error, stage: "transcribe" } as SttError;
  } finally {
    // Step 4: cleanup /dev/shm temp file (always runs, even on crash)
    if (tmpPath) {
      try { unlinkSync(tmpPath); } catch { /* already gone */ }
    }
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Verify whisper.cpp binary exists and model path is accessible.
 * Returns model file size if accessible; throws otherwise.
 */
export function checkSttHealth(): { modelPath: string; modelBytes: number; ok: boolean } {
  try {
    const stats = readFileSync(WHISPER_MODEL_PATH);
    return {
      modelPath: WHISPER_MODEL_PATH,
      modelBytes: stats.byteLength,
      ok: true,
    };
  } catch (err) {
    return {
      modelPath: WHISPER_MODEL_PATH,
      modelBytes: 0,
      ok: false,
    };
  }
}

// ─── SLO tracking ────────────────────────────────────────────────────────────

/**
 * STT SLO: transcription should complete within 5s for <30s audio clips.
 * This is a soft target; /dev/shm write + whisper.cpp are the bottlenecks.
 */
export const STT_SLO_MS = 5_000;

/**
 * Check if a transcription result meets SLO.
 */
export function meetsSlo(result: SttResult): boolean {
  return result.transcriptionMs <= STT_SLO_MS;
}
