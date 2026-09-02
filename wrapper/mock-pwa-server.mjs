#!/usr/bin/env node
// T-M1c-QA-1: Local mock PWA server for Playwright smoke test
// Serves a minimal PWA-like page for form element verification
// Run directly: node mock-pwa-server.mjs
// Or used by playwright.config.ts webServer command

import http from 'http';

const PORT = 3847;
const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>Fish Harness — PWA</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #333; }
    form { display: flex; flex-direction: column; gap: 12px; }
    input[name="prompt"] { padding: 10px; font-size: 16px; }
    button[type="submit"] { padding: 10px 20px; font-size: 16px; cursor: pointer; }
    .status { margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Fish Harness</h1>
  <p>Enter a task to dispatch:</p>
  <form id="dispatch-form">
    <input name="prompt" type="text" placeholder="调研 React 19 新特性" required />
    <button type="submit">Dispatch Task</button>
  </form>
  <div id="result" class="status" style="display:none"></div>
  <script>
    const form = document.getElementById('dispatch-form');
    const result = document.getElementById('result');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const taskId = 'smoke-task-' + Date.now();
      result.style.display = 'block';
      result.textContent = 'Task submitted: ' + taskId + ' (status: pending)';
    });
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`[mock-pwa-server] listening on http://localhost:${PORT}`);
});

// Auto-exit after 120s to avoid orphaned process
setTimeout(() => {
  server.close();
  process.exit(0);
}, 120_000);
