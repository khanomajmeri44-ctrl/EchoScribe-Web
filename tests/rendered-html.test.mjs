import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the EchoScribe interface and lightweight English model", async () => {
  const [page, app, worker, models, manifest] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/EchoScribeWeb.tsx", root), "utf8"),
    readFile(new URL("workers/transcriber.worker.ts", root), "utf8"),
    readFile(new URL("lib/models.ts", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
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
  assert.match(app, /Cancel and choose another/);
  assert.match(app, /model-loader-track/);
  assert.match(worker, /return_timestamps:\s*true/);
  assert.doesNotMatch(worker, /language:\s*"english"|task:\s*"transcribe"|dtype:\s*"q8"/);
  assert.doesNotMatch(worker, /whisper-(small|medium|large)/);
  assert.equal(JSON.parse(manifest).name, "EchoScribe");
});
