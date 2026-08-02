import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the EchoScribe interface and lightweight English model", async () => {
  const [page, app, worker, models, manifest, cache, html] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/EchoScribeWeb.tsx", root), "utf8"),
    readFile(new URL("workers/transcriber.worker.ts", root), "utf8"),
    readFile(new URL("lib/models.ts", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
    readFile(new URL("lib/transcript-cache.ts", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);
  assert.match(page, /EchoScribeWeb/);
  assert.match(app, /Transcript/);
  assert.match(app, /Open audio/);
  assert.match(app, /Download Windows/);
  assert.match(app, /releases\/download\/v1\.2\.0\/EchoScribe-1\.2\.0-SelfExtracting\.exe/);
  assert.doesNotMatch(app, /Batch scan|handleBatchInput|batchProcessing/);
  assert.match(app, /Your audio never leaves this device/);
  assert.match(models, /onnx-community\/whisper-tiny\.en/);
  assert.match(models, /onnx-community\/whisper-small\.en/);
  assert.match(models, /onnx-community\/whisper-tiny"/);
  assert.match(models, /onnx-community\/whisper-small"/);
  assert.match(app, /echoscribe-model/);
  assert.match(app, /FIRST-TIME SETUP/);
  assert.match(app, /echoscribe-ui-language/);
  assert.match(app, /language-toggle/);
  assert.match(app, /Choose interface language/);
  assert.match(app, /选择界面语言/);
  assert.match(app, /completeInitialSetup/);
  assert.match(app, /Cancel and choose another/);
  assert.match(app, /model-loader-track/);
  assert.match(app, /Downloading model/);
  assert.match(app, /Loading model/);
  assert.match(app, /正在下载模型/);
  assert.match(app, /正在加载模型/);
  assert.match(app, /modelPhase/);
  assert.match(app, /model-download-stats/);
  assert.match(app, /downloadStats/);
  assert.match(app, /formatBytes/);
  assert.match(app, /formatDuration/);
  assert.match(app, /预计等待/);
  assert.match(worker, /progress_total/);
  assert.match(worker, /model-phase/);
  assert.match(worker, /return_timestamps:\s*true/);
  assert.match(worker, /Safari compatibility mode/);
  assert.match(worker, /requestAdapter/);
  assert.match(app, /webkitAudioContext/);
  assert.doesNotMatch(app, /OfflineAudioContext|\.at\(/);
  assert.match(app, /\.aiff/);
  assert.match(cache, /catch \{/);
  assert.match(html, /apple-touch-icon/);
  assert.doesNotMatch(worker, /language:\s*"english"|task:\s*"transcribe"|dtype:\s*"q8"/);
  assert.doesNotMatch(worker, /whisper-(small|medium|large)/);
  assert.equal(JSON.parse(manifest).name, "EchoScribe");
});
