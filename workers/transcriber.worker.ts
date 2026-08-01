import { env, pipeline } from "@huggingface/transformers";

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

const MODEL = "onnx-community/whisper-tiny.en";
const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 28;
let transcriberPromise: Promise<any> | null = null;
let backend = "WASM";

env.useBrowserCache = true;
env.allowRemoteModels = true;

function send(message: Record<string, unknown>) {
  self.postMessage(message);
}

async function createPipeline() {
  const hasWebGpu = "gpu" in navigator;
  if (hasWebGpu) {
    try {
      const transcriber = await pipeline("automatic-speech-recognition", MODEL, {
        device: "webgpu",
        dtype: { encoder_model: "q4", decoder_model_merged: "q4" },
        progress_callback: reportModelProgress,
      });
      backend = "WebGPU";
      return transcriber;
    } catch {
      send({ type: "model-fallback", message: "WebGPU unavailable · switching to CPU" });
    }
  }
  const transcriber = await pipeline("automatic-speech-recognition", MODEL, {
    device: "wasm",
    dtype: "q8",
    progress_callback: reportModelProgress,
  });
  backend = "WASM";
  return transcriber;
}

function reportModelProgress(event: any) {
  const progress = typeof event?.progress === "number" ? event.progress / 100 : 0;
  send({
    type: "model-progress",
    progress: Math.max(0, Math.min(progress, 1)),
    file: typeof event?.file === "string" ? event.file : "",
    status: event?.status ?? "loading",
  });
}

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = createPipeline();
  }
  const transcriber = await transcriberPromise;
  send({ type: "model-ready", backend });
  return transcriber;
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
  const transcriber = await getTranscriber();
  const totalSeconds = audio.length / SAMPLE_RATE;
  let cursor = Math.max(0, Math.min(resumeAt, totalSeconds));
  let pending: WordChunk[] = [];

  while (cursor < totalSeconds) {
    const chunkEnd = Math.min(cursor + CHUNK_SECONDS, totalSeconds);
    const startSample = Math.floor(cursor * SAMPLE_RATE);
    const endSample = Math.floor(chunkEnd * SAMPLE_RATE);
    const output = (await transcriber(audio.slice(startSample, endSample), {
      language: "english",
      task: "transcribe",
      return_timestamps: "word",
    })) as PipelineOutput;
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
      await getTranscriber();
    }
    if (message.type === "transcribe") {
      await transcribe(message.jobId, message.audio, message.resumeAt ?? 0);
    }
  } catch (error) {
    send({
      type: "error",
      jobId: message.jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
