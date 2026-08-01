import { env, pipeline } from "@huggingface/transformers";
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
let transcriberPromise: Promise<any> | null = null;
let backend = "WASM";
let activeModelId: ModelId = DEFAULT_MODEL_ID;

env.useBrowserCache = true;
env.allowRemoteModels = true;
const wasmOptions = (env as any).backends?.onnx?.wasm;
if (wasmOptions) {
  wasmOptions.numThreads = self.crossOriginIsolated
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
    : 1;
}

function send(message: Record<string, unknown>) {
  self.postMessage(message);
}

async function createWasmPipeline() {
  const model = getModelOption(activeModelId);
  send({ type: "model-runtime", backend: "WASM", modelId: activeModelId });
  const transcriber = await pipeline("automatic-speech-recognition", model.repo, {
    device: "wasm",
    dtype: { encoder_model: "q4", decoder_model_merged: "q4" },
    progress_callback: reportModelProgress,
  });
  backend = "WASM";
  return transcriber;
}

async function createPipeline() {
  const model = getModelOption(activeModelId);
  const hasWebGpu = "gpu" in navigator;
  if (hasWebGpu) {
    try {
      const transcriber = await pipeline("automatic-speech-recognition", model.repo, {
        device: "webgpu",
        dtype: { encoder_model: "q4", decoder_model_merged: "q4" },
        progress_callback: reportModelProgress,
      });
      backend = "WebGPU";
      return transcriber;
    } catch {
      send({ type: "model-fallback", message: "WebGPU unavailable · switching to CPU", modelId: activeModelId });
    }
  }
  return createWasmPipeline();
}

function reportModelProgress(event: any) {
  const progress = typeof event?.progress === "number" ? event.progress / 100 : 0;
  send({
    type: "model-progress",
    modelId: activeModelId,
    progress: Math.max(0, Math.min(progress, 1)),
    file: typeof event?.file === "string" ? event.file : "",
    status: event?.status ?? "loading",
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
