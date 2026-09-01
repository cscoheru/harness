#!/usr/bin/env python3
"""docs/m0b/m0b-rest-spike.py — DeepSeek REST API spike runner for M0b H-1/H-2.

Usage:
  export DEEPSEEK_API_KEY=sk-...
  python3 docs/m0b/m0b-rest-spike.py --class commander --task summary \
    --input /tmp/m0b-input.txt --output /tmp/m0b-output.json

Per Codex review M6:
- Computes median across runs (wall_s, input_tokens, output_tokens)
- Exits 1 when ALL runs fail (no fallback to success)
- Writes .log file with per-run trace
- Adds --max-tokens cost guard (default 4096)
- Adds 429/5xx retry with exponential backoff

Per Codex review M2 + M5: B-only runs validate text-only A-class tasks
(research/summary); TG-1 code-change MUST run via posture A (dsh + override)
because REST single-turn completion has no tool loop.
"""
import argparse
import json
import os
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import httpx
except ImportError:
    print("ERROR: httpx not installed. pip install 'httpx>=0.28,<0.29'", file=sys.stderr)
    sys.exit(2)

API_BASE = "https://api.deepseek.com/v1"

# Class → SKU mapping (per Codex review M2 unified table).
# vision-exp is OPTIONAL EXPLORATION ARM — set --model deepseek-v4-flash-vision-exp
# explicitly via --model override when the task needs vision input.
MODELS = {
    "orch": "deepseek-v4-pro",
    "commander": "deepseek-v4-flash",
    "worker": "deepseek-v4-flash",
}


def chat_with_retry(model: str, prompt: str, api_key: str,
                    max_tokens: int, max_retries: int, timeout: float) -> dict:
    """Single chat completion with 429/5xx retry + exponential backoff."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "max_tokens": max_tokens,
    }
    last_err = None
    for attempt in range(max_retries + 1):
        t0 = time.time()
        try:
            r = httpx.post(
                f"{API_BASE}/chat/completions",
                headers=headers,
                json=payload,
                timeout=timeout,
            )
            wall = time.time() - t0
            if r.status_code == 429 or r.status_code >= 500:
                # retryable
                last_err = f"HTTP {r.status_code}: {r.text[:200]}"
                if attempt < max_retries:
                    backoff = 2 ** attempt
                    print(f"  attempt {attempt+1} → {last_err}; retry in {backoff}s",
                          file=sys.stderr)
                    time.sleep(backoff)
                    continue
                return {"error": last_err, "wall_s": round(wall, 3),
                        "status": r.status_code, "attempt": attempt + 1}
            r.raise_for_status()
            body = r.json()
            return {
                "model": model,
                "wall_s": round(wall, 3),
                "input_tokens": body["usage"]["prompt_tokens"],
                "output_tokens": body["usage"]["completion_tokens"],
                "content": body["choices"][0]["message"]["content"],
                "status": r.status_code,
                "attempt": attempt + 1,
            }
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = f"{type(e).__name__}: {e}"
            if attempt < max_retries:
                backoff = 2 ** attempt
                print(f"  attempt {attempt+1} → {last_err}; retry in {backoff}s",
                      file=sys.stderr)
                time.sleep(backoff)
                continue
            return {"error": last_err, "attempt": attempt + 1}
    return {"error": last_err or "exhausted retries", "attempt": max_retries + 1}


def median_or_none(values: list) -> float | None:
    """Return median of values, or None if list is empty."""
    if not values:
        return None
    return round(statistics.median(values), 3)


def main():
    p = argparse.ArgumentParser(
        description="DeepSeek REST spike runner for M0b H-1/H-2 (text-only tasks)"
    )
    p.add_argument("--model", choices=list(MODELS.values()),
                   help="Explicit model id (overrides --class)")
    p.add_argument("--class", dest="klass", choices=list(MODELS.keys()),
                   help="Equivalence class → SKU mapping")
    p.add_argument("--task", required=True,
                   choices=["research", "code-change", "summary"],
                   help="A-class task type (note: code-change not supported by REST)")
    p.add_argument("--input", required=True, type=Path,
                   help="Input prompt file path")
    p.add_argument("--output", required=True, type=Path,
                   help="Output JSON results file path")
    p.add_argument("--runs", type=int, default=3,
                   help="Number of runs for median (R-M0b-1; default 3)")
    p.add_argument("--max-tokens", type=int, default=4096,
                   help="Cost guard: max output tokens per call (default 4096)")
    p.add_argument("--max-retries", type=int, default=2,
                   help="Max retries on 429/5xx (default 2)")
    p.add_argument("--timeout", type=float, default=60.0,
                   help="HTTP timeout seconds (default 60)")
    args = p.parse_args()

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        print("ERROR: DEEPSEEK_API_KEY not set", file=sys.stderr)
        sys.exit(2)

    # Resolve model: --model explicit > --class mapping > MODELS default
    if args.model:
        model = args.model
    elif args.klass:
        model = MODELS[args.klass]
    else:
        model = MODELS["commander"]

    # Per Codex review M5: warn when REST runner used for code-change
    if args.task == "code-change":
        print("WARNING: code-change A-class task NOT supported by REST single-turn "
              "(no tool loop). Use posture A (dsh + override) for TG-1. "
              "REST result will be a single-shot edit attempt, not a real diff.",
              file=sys.stderr)

    if not args.input.exists():
        print(f"ERROR: input file not found: {args.input}", file=sys.stderr)
        sys.exit(2)

    prompt = args.input.read_text(encoding="utf-8")
    started_at = datetime.now(timezone.utc).isoformat()

    results = []
    for i in range(args.runs):
        print(f"Run {i+1}/{args.runs}: model={model} task={args.task}", file=sys.stderr)
        res = chat_with_retry(model, prompt, api_key,
                              args.max_tokens, args.max_retries, args.timeout)
        res["run"] = i + 1
        results.append(res)
        if "error" not in res:
            print(f"  → {res['wall_s']}s, in={res['input_tokens']}, out={res['output_tokens']}",
                  file=sys.stderr)
        else:
            print(f"  → FAILED: {res['error']}", file=sys.stderr)

    # Per Codex review M6: compute medians + exit non-zero when ALL failed
    successful = [r for r in results if "error" not in r]
    failed = [r for r in results if "error" in r]

    summary = {
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "task": args.task,
        "runs": args.runs,
        "succeeded": len(successful),
        "failed": len(failed),
        "median_wall_s": median_or_none([r["wall_s"] for r in successful]),
        "median_input_tokens": median_or_none(
            [r["input_tokens"] for r in successful if "input_tokens" in r]
        ),
        "median_output_tokens": median_or_none(
            [r["output_tokens"] for r in successful if "output_tokens" in r]
        ),
        "results": results,
    }

    args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Wrote {args.runs} runs ({len(successful)} ok, {len(failed)} failed) to {args.output}",
          file=sys.stderr)

    # Per Codex review M6: write .log sidecar with per-run trace
    log_path = args.output.with_suffix(".log")
    with log_path.open("w", encoding="utf-8") as f:
        f.write(f"# docs/m0b/m0b-rest-spike.py trace\n")
        f.write(f"# started_at={started_at}\n")
        f.write(f"# model={model}\n")
        f.write(f"# task={args.task}\n")
        f.write(f"# runs={args.runs}\n\n")
        for r in results:
            f.write(f"--- run {r['run']} ---\n")
            if "error" in r:
                f.write(f"FAILED: {r['error']} (attempt {r.get('attempt', '?')})\n\n")
            else:
                f.write(f"wall={r['wall_s']}s status={r['status']} attempt={r['attempt']}\n")
                f.write(f"in_tokens={r['input_tokens']} out_tokens={r['output_tokens']}\n")
                f.write(f"content:\n{r['content']}\n\n")
    print(f"Wrote trace to {log_path}", file=sys.stderr)

    # Per Codex review M6: exit 1 when ALL runs failed
    if failed and not successful:
        print(f"ERROR: all {args.runs} runs failed; exiting 1", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
