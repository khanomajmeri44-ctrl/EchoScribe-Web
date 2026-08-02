import { env, ModelRegistry, pipeline } from "@huggingface/transformers";
import { DEFAULT_MODEL_ID, getModelOption, type ModelId } from "../lib/models";

type WordChunk = {
  text: string;
  timestamp: [number, number];
};

type TranscriptEntry = {
  start: number;
  end: number;
  text: string;
};

type PipelineOutput = {
  text: string;
  chunks?: WordChunk[];
};

const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 28;
const PRIMARY_MODEL_HOST = "https://hf-mirror.com/";
const FALLBACK_MODEL_HOST = "https://huggingface.co/";
let transcriberPromise: Promise<any> | null = null;
let backend = "WASM";
let activeModelId: ModelId = DEFAULT_MODEL_ID;
let preferCachedModel = false;

const MODEL_DTYPE = { encoder_model: "q4", decoder_model_merged: "q4" } as const;

env.useBrowserCache = "caches" in self;
env.useWasmCache = "caches" in self;
env.allowRemoteModels = true;
env.remoteHost = PRIMARY_MODEL_HOST;
const wasmOptions = (env as any).backends?.onnx?.wasm;
if (wasmOptions) {
  wasmOptions.numThreads = self.crossOriginIsolated
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
    : 1;
}

function send(message: Record<string, unknown>) {
  self.postMessage(message);
}

function isMirrorTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("hf-mirror.com") || /failed to fetch|networkerror|network request failed|load failed/i.test(message);
}

async function findCachedModelHost(device: "wasm" | "webgpu"): Promise<string | null> {
  if (!preferCachedModel) return null;
  for (const host of [PRIMARY_MODEL_HOST, FALLBACK_MODEL_HOST]) {
    env.remoteHost = host;
    try {
      const cached = await ModelRegistry.is_pipeline_cached("automatic-speech-recognition", getModelOption(activeModelId).repo, {
        device,
        dtype: MODEL_DTYPE,
      });
      if (cached) return host;
    } catch {}
  }
  return null;
}

async function downloadPipeline(device: "wasm" | "webgpu") {
  const model = getModelOption(activeModelId);
  const options = {
    device,
    dtype: MODEL_DTYPE,
    progress_callback: reportModelProgress,
  };
  env.remoteHost = PRIMARY_MODEL_HOST;
  try {
    return await pipeline("automatic-speech-recognition", model.repo, options);
  } catch (error) {
    if (!isMirrorTransportError(error)) throw error;
    send({
      type: "model-fallback",
      message: "Domestic mirror unavailable · switching to the official model source",
      modelId: activeModelId,
    });
    send({ type: "model-phase", phase: "connecting", source: "official", modelId: activeModelId });
    env.remoteHost = FALLBACK_MODEL_HOST;
    return pipeline("automatic-speech-recognition", model.repo, options);
  }
}

async function loadPipeline(device: "wasm" | "webgpu") {
  const model = getModelOption(activeModelId);
  send({ type: "model-phase", phase: "checking", modelId: activeModelId });
  const cachedHost = await findCachedModelHost(device);
  send({
    type: "model-phase",
    phase: cachedHost ? "loading" : "connecting",
    source: cachedHost ? "cache" : "hf-mirror",
    modelId: activeModelId,
  });
  if (!cachedHost) return downloadPipeline(device);
  env.remoteHost = cachedHost;
  return pipeline("automatic-speech-recognition", model.repo, { device, dtype: MODEL_DTYPE });
}

async function createWasmPipeline() {
  send({ type: "model-runtime", backend: "WASM", modelId: activeModelId });
  const transcriber = await loadPipeline("wasm");
  backend = "WASM";
  return transcriber;
}

async function createPipeline() {
  const isSafari = Boolean((env as any).isSafari?.());
  const safariVersion = Number(navigator.userAgent.match(/Version\/(\d+)/)?.[1] ?? 0);
  const safariSupportsStableWebGpu = !isSafari || safariVersion >= 26;
  let hasWebGpu = "gpu" in navigator && safariSupportsStableWebGpu;
  if ("gpu" in navigator && !safariSupportsStableWebGpu) {
    send({ type: "model-fallback", message: "Safari compatibility mode · using CPU", modelId: activeModelId });
  }
  if (hasWebGpu) {
    try {
      const adapter = await (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
      hasWebGpu = Boolean(adapter);
    } catch {
      hasWebGpu = false;
    }
  }
  if (hasWebGpu) {
    try {
      send({ type: "model-runtime", backend: "WebGPU", modelId: activeModelId });
      const transcriber = await loadPipeline("webgpu");
      backend = "WebGPU";
      return transcriber;
    } catch {
      send({ type: "model-fallback", message: "WebGPU unavailable · switching to CPU", modelId: activeModelId });
    }
  }
  return createWasmPipeline();
}

function reportModelProgress(event: any) {
  if (event?.status === "ready") {
    send({ type: "model-phase", phase: "loading", modelId: activeModelId });
    return;
  }
  if (event?.status !== "progress_total") return;
  const progress = Math.max(0, Math.min((event.progress ?? 0) / 100, 1));
  send({
    type: "model-progress",
    modelId: activeModelId,
    progress,
    phase: progress >= 0.999 ? "loading" : "downloading",
    loaded: event.loaded ?? 0,
    total: event.total ?? 0,
  });
}

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = createPipeline();
  }
  try {
    const transcriber = await transcriberPromise;
    send({ type: "model-ready", backend, modelId: activeModelId });
    return transcriber;
  } catch (error) {
    transcriberPromise = null;
    throw error;
  }
}

async function retryWithWasm(error: unknown) {
  send({
    type: "model-fallback",
    modelId: activeModelId,
    message: `WebGPU transcription failed · switching to CPU (${error instanceof Error ? error.message : String(error)})`,
  });
  const previous = transcriberPromise ? await transcriberPromise.catch(() => null) : null;
  await previous?.dispose?.();
  transcriberPromise = createWasmPipeline();
  return getTranscriber();
}

async function runChunk(transcriber: any, audio: Float32Array) {
  const model = getModelOption(activeModelId);
  const options: Record<string, unknown> = {
    return_timestamps: true as const,
  };
  if (model.language === "ja") {
    options.language = "japanese";
    options.task = "transcribe";
  }
  const activeTranscriber = backend === "WASM" && transcriberPromise
    ? await transcriberPromise
    : transcriber;
  try {
    return (await activeTranscriber(audio, options)) as PipelineOutput;
  } catch (error) {
    if (backend !== "WebGPU") throw error;
    const wasmTranscriber = await retryWithWasm(error);
    return (await wasmTranscriber(audio, options)) as PipelineOutput;
  }
}

function normalizeWord(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceEntries(words: WordChunk[], offset: number, final: boolean): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let text = "";
  let start = 0;
  let end = 0;
  let count = 0;

  const flush = () => {
    const clean = normalizeWord(text);
    if (clean) {
      entries.push({ start, end, text: clean });
    }
    text = "";
    count = 0;
  };

  for (const word of words) {
    const clean = normalizeWord(word.text);
    if (!clean) continue;
    if (!text) start = offset + Math.max(0, word.timestamp[0] ?? 0);
    end = offset + Math.max(word.timestamp[1] ?? word.timestamp[0] ?? 0, 0);
    text += `${text ? " " : ""}${clean}`;
    count += 1;
    if (/[.!?][”’"']?$/.test(clean) || count >= 24 || end - start >= 10) flush();
  }
  if (final) flush();
  return entries;
}

async function transcribe(jobId: string, audio: Float32Array, resumeAt: number) {
  send({ type: "job-accepted", jobId, modelId: activeModelId });
  const transcriber = await getTranscriber();
  send({ type: "job-started", jobId, backend, modelId: activeModelId });
  const totalSeconds = audio.length / SAMPLE_RATE;
  let cursor = Math.max(0, Math.min(resumeAt, totalSeconds));
  let pending: WordChunk[] = [];

  while (cursor < totalSeconds) {
    const chunkEnd = Math.min(cursor + CHUNK_SECONDS, totalSeconds);
    const startSample = Math.floor(cursor * SAMPLE_RATE);
    const endSample = Math.floor(chunkEnd * SAMPLE_RATE);
    const output = await runChunk(transcriber, audio.slice(startSample, endSample));
    pending.push(
      ...(output.chunks ?? []).map((word) => ({
        text: word.text,
        timestamp: [
          cursor + Math.max(0, word.timestamp[0] ?? 0),
          cursor + Math.max(0, word.timestamp[1] ?? word.timestamp[0] ?? 0),
        ] as [number, number],
      })),
    );
    const isFinal = chunkEnd >= totalSeconds;
    const finishedWords: WordChunk[] = [];
    let lastSentenceIndex = -1;
    for (let index = 0; index < pending.length; index += 1) {
      if (/[.!?][”’"']?$/.test(normalizeWord(pending[index].text))) lastSentenceIndex = index;
    }
    if (isFinal) lastSentenceIndex = pending.length - 1;
    if (lastSentenceIndex >= 0) finishedWords.push(...pending.splice(0, lastSentenceIndex + 1));
    const entries = sentenceEntries(finishedWords, 0, isFinal);
    send({
      type: "partial",
      jobId,
      entries,
      processedUntil: chunkEnd,
      progress: totalSeconds ? chunkEnd / totalSeconds : 1,
    });
    cursor = chunkEnd;
  }
  send({ type: "complete", jobId, processedUntil: totalSeconds });
}

self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      const requestedModel = getModelOption(message.modelId ?? DEFAULT_MODEL_ID);
      preferCachedModel = message.preferCached === true;
      if (requestedModel.id !== activeModelId) {
        const previous = transcriberPromise ? await transcriberPromise.catch(() => null) : null;
        await previous?.dispose?.();
        transcriberPromise = null;
        activeModelId = requestedModel.id;
        backend = "WASM";
      }
      await getTranscriber();
    }
    if (message.type === "transcribe") {
      await transcribe(message.jobId, message.audio, message.resumeAt ?? 0);
    }
  } catch (error) {
    send({
      type: "error",
      modelId: activeModelId,
      jobId: message.jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
