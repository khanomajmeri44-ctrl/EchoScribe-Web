"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from "react";
import {
  deleteTranscript,
  readTranscript,
  TranscriptEntry,
  writeTranscript,
} from "@/lib/transcript-cache";
import { DEFAULT_MODEL_ID, MODEL_OPTIONS, getModelOption, isModelId, type ModelId } from "@/lib/models";

type WorkerEvent = {
  type: string;
  jobId?: string;
  backend?: string;
  message?: string;
  progress?: number;
  processedUntil?: number;
  entries?: TranscriptEntry[];
  modelId?: ModelId;
  phase?: ModelPhase;
  loaded?: number;
  total?: number;
};

type UiLanguage = "en" | "zh";
type SetupStep = "model" | "language";
type ModelPhase = "checking" | "downloading" | "loading" | "ready";
type DownloadStats = { loaded: number; total: number; speed: number; eta: number | null };

const COPY = {
  en: {
    downloadWindows: "Download Windows",
    light: "Light",
    dark: "Dark",
    regenerate: "Regenerate",
    openAudio: "Open audio",
    englishModels: "English models",
    japaneseModels: "Japanese models",
    preparingEngine: "Preparing transcription engine",
    loading: "Loading",
    checkingModel: "Checking model cache",
    downloadingModel: "Downloading model",
    loadingModel: "Loading model",
    checkingHint: "Checking whether the model files are already stored on this device",
    downloadingHint: "Downloading model files to this browser",
    loadingHint: "Download complete · loading the model into memory",
    downloadedSize: "Downloaded",
    downloadSpeed: "Speed",
    waitingTime: "Time left",
    calculating: "Calculating",
    downloadComplete: "Complete",
    cancelAndChoose: "Cancel and choose another",
    firstTimeSetup: "FIRST-TIME SETUP",
    chooseLevel: "Choose your transcription level",
    modelSaved: "Your choice is saved on this device. You can change it at any time.",
    english: "English",
    japanese: "Japanese",
    recommended: "Recommended",
    higherLevels: "Higher levels improve difficult audio but require more memory and a longer first download.",
    chooseInterfaceLanguage: "Choose your interface language",
    languageSaved: "The interface language is saved in this browser and can be changed from A/文 at any time.",
    chineseInterface: "中文界面",
    englishInterface: "English interface",
    chineseInterfaceHint: "使用简体中文显示按钮、提示和设置",
    englishInterfaceHint: "Display buttons, prompts, and settings in English",
    audioWorkspace: "AUDIO WORKSPACE",
    openAnAudio: "Open an audio file",
    browserAudio: "Browser-synchronized audio",
    onDevice: "On-device only",
    back10: "Back 10 seconds",
    forward10: "Forward 10 seconds",
    playAudio: "Play audio",
    pauseAudio: "Pause audio",
    volume: "Volume",
    privateTitle: "Private by design",
    privateBody: "Your audio never leaves this device. The selected model and transcript are cached by this browser.",
    transcript: "Transcript",
    transcriptSubtitle: "New passages appear here while the audio is transcribed",
    searchTranscript: "Search transcript",
    listening: "Listening for",
    speech: "speech…",
    transcriptEmpty: "Your transcript will appear here",
    openOrDrop: "Open or drop an audio file to begin local transcription.",
    modelCaching: "The selected model is being cached for first use.",
    showSubtitles: "Show subtitle text",
    hideSubtitles: "Hide subtitle text",
    continueAudio: "Continue audio",
    switchLanguage: "切换到中文界面",
    ready: "ready",
    passages: "passages",
    levels: ["Fast", "Balanced", "Advanced"],
    memory: ["Low memory", "Medium memory", "High memory"],
    recommendations: [
      "Recommended for 4 GB RAM, older CPUs, and integrated graphics",
      "Recommended for 8 GB RAM and 8th-gen i5 or newer",
      "Recommended for 16 GB RAM and modern WebGPU hardware",
    ],
  },
  zh: {
    downloadWindows: "下载 Windows 客户端",
    light: "浅色",
    dark: "深色",
    regenerate: "重新生成字幕",
    openAudio: "打开音频",
    englishModels: "英语模型",
    japaneseModels: "日语模型",
    preparingEngine: "正在准备转写引擎",
    loading: "正在加载",
    checkingModel: "正在检查模型缓存",
    downloadingModel: "正在下载模型",
    loadingModel: "正在加载模型",
    checkingHint: "正在检查此设备是否已经保存模型文件",
    downloadingHint: "正在将模型文件下载到当前浏览器",
    loadingHint: "模型下载完成 · 正在加载到内存",
    downloadedSize: "文件大小",
    downloadSpeed: "下载速度",
    waitingTime: "预计等待",
    calculating: "计算中",
    downloadComplete: "已完成",
    cancelAndChoose: "取消并选择其他模型",
    firstTimeSetup: "首次设置",
    chooseLevel: "选择转写语言和性能档位",
    modelSaved: "选择会保存在此设备中，之后可随时在右上角更改。",
    english: "英语",
    japanese: "日语",
    recommended: "推荐",
    higherLevels: "更高档位对复杂音频的识别更准确，但需要更多内存，首次下载时间也更长。",
    chooseInterfaceLanguage: "选择界面语言",
    languageSaved: "界面语言会保存在此浏览器中，之后可随时通过顶部的 A/文 按钮切换。",
    chineseInterface: "中文界面",
    englishInterface: "English interface",
    chineseInterfaceHint: "使用简体中文显示按钮、提示和设置",
    englishInterfaceHint: "Display buttons, prompts, and settings in English",
    audioWorkspace: "音频工作区",
    openAnAudio: "打开一个音频文件",
    browserAudio: "浏览器同步音频",
    onDevice: "仅在本机处理",
    back10: "后退 10 秒",
    forward10: "前进 10 秒",
    playAudio: "播放音频",
    pauseAudio: "暂停音频",
    volume: "音量",
    privateTitle: "隐私优先",
    privateBody: "音频不会离开此设备，所选模型和转写结果仅缓存在当前浏览器中。",
    transcript: "字幕",
    transcriptSubtitle: "转写过程中，新的字幕段落会实时显示在这里",
    searchTranscript: "搜索字幕",
    listening: "正在识别",
    speech: "语音…",
    transcriptEmpty: "字幕将在这里显示",
    openOrDrop: "打开或拖入音频文件即可开始本地转写。",
    modelCaching: "首次使用时正在缓存所选模型。",
    showSubtitles: "显示字幕文字",
    hideSubtitles: "隐藏字幕文字",
    continueAudio: "继续播放",
    switchLanguage: "Switch to English",
    ready: "已就绪",
    passages: "条字幕",
    levels: ["快速", "均衡", "高精度"],
    memory: ["低内存占用", "中等内存占用", "高内存占用"],
    recommendations: [
      "适合 4 GB 内存、较旧处理器和集成显卡",
      "推荐 8 GB 内存及第 8 代 i5 或更新配置",
      "推荐 16 GB 内存及支持 WebGPU 的现代硬件",
    ],
  },
} as const;

const WAVEFORM = [
  16, 27, 39, 24, 48, 31, 19, 42, 52, 34, 27, 45, 58, 33, 22, 49, 61, 38, 25, 54,
  63, 41, 29, 57, 46, 31, 51, 37, 23, 44, 55, 35, 18,
];

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 1024 * 100 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 * 100 ? 1 : 0)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
}

function mergeEntries(current: TranscriptEntry[], incoming: TranscriptEntry[]): TranscriptEntry[] {
  const merged = [...current];
  for (const candidate of incoming) {
    const clean = candidate.text.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const duplicate = merged.some(
      (entry) =>
        Math.abs(entry.start - candidate.start) < 0.45 &&
        entry.text.toLocaleLowerCase() === clean.toLocaleLowerCase(),
    );
    if (!duplicate) merged.push({ ...candidate, text: clean });
  }
  return merged.sort((left, right) => left.start - right.start);
}

async function decodeAudio(file: File): Promise<Float32Array> {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio is not available in this browser");
  const sourceContext = new AudioContextClass();
  try {
    const decoded = await sourceContext.decodeAudioData(await file.arrayBuffer());
    const outputLength = Math.max(1, Math.ceil(decoded.duration * 16000));
    const output = new Float32Array(outputLength);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const sampleRatio = decoded.sampleRate / 16000;
    for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
      const sourcePosition = Math.min(outputIndex * sampleRatio, decoded.length - 1);
      const leftIndex = Math.floor(sourcePosition);
      const rightIndex = Math.min(leftIndex + 1, decoded.length - 1);
      const fraction = sourcePosition - leftIndex;
      let mixedSample = 0;
      for (const channel of channels) {
        mixedSample += channel[leftIndex] + (channel[rightIndex] - channel[leftIndex]) * fraction;
      }
      output[outputIndex] = mixedSample / Math.max(channels.length, 1);
    }
    return output;
  } finally {
    await sourceContext.close().catch(() => undefined);
  }
}

function createJobId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function EchoScribeWeb() {
  const [dark, setDark] = useState(false);
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("en");
  const [setupStep, setSetupStep] = useState<SetupStep>("model");
  const [pendingModelId, setPendingModelId] = useState<ModelId>(DEFAULT_MODEL_ID);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Open an audio file to begin");
  const [modelProgress, setModelProgress] = useState(0);
  const [modelPhase, setModelPhase] = useState<ModelPhase>("checking");
  const [downloadStats, setDownloadStats] = useState<DownloadStats>({ loaded: 0, total: 0, speed: 0, eta: null });
  const [modelReady, setModelReady] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<ModelId>(DEFAULT_MODEL_ID);
  const [modelChoiceReady, setModelChoiceReady] = useState(false);
  const [modelChooserOpen, setModelChooserOpen] = useState(false);
  const [backend, setBackend] = useState("Detecting");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.82);
  const [textHidden, setTextHidden] = useState(false);
  const [toast, setToast] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerHandlerRef = useRef<(event: MessageEvent<WorkerEvent>) => void>(() => undefined);
  const activeJobRef = useRef("");
  const activeFileRef = useRef<File | null>(null);
  const entriesRef = useRef<TranscriptEntry[]>([]);
  const resolveJobRef = useRef<((success: boolean) => void) | null>(null);
  const modelProgressRef = useRef(0);
  const selectedModelRef = useRef<ModelId>(DEFAULT_MODEL_ID);
  const workerModelRef = useRef<ModelId | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadSampleRef = useRef({ loaded: 0, measuredAt: 0, speed: 0, renderedAt: 0 });
  const copy = COPY[uiLanguage];
  const tr = (english: string, chinese: string) => uiLanguage === "zh" ? chinese : english;
  const displayModel = (modelId: ModelId) => {
    const model = getModelOption(modelId);
    const levelIndex = modelId.endsWith("tiny") ? 0 : modelId.endsWith("base") ? 1 : 2;
    return `${model.language === "ja" ? copy.japanese : copy.english} · ${copy.levels[levelIndex]}`;
  };

  const replaceEntries = (value: TranscriptEntry[]) => {
    entriesRef.current = value;
    setEntries(value);
  };

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2600);
  };

  const createWorker = (modelId: ModelId = selectedModelRef.current) => {
    setModelPhase("checking");
    setDownloadStats({ loaded: 0, total: 0, speed: 0, eta: null });
    downloadSampleRef.current = { loaded: 0, measuredAt: performance.now(), speed: 0, renderedAt: 0 };
    const worker = new Worker(new URL("../workers/transcriber.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => workerHandlerRef.current(event);
    worker.postMessage({ type: "load", modelId });
    workerRef.current = worker;
    workerModelRef.current = modelId;
    return worker;
  };

  const ensureWorker = (modelId: ModelId = selectedModelRef.current) => {
    if (workerRef.current && workerModelRef.current === modelId) return workerRef.current;
    workerRef.current?.terminate();
    workerRef.current = null;
    return createWorker(modelId);
  };

  const stopCurrentJob = (reloadModel = true, modelId: ModelId = selectedModelRef.current) => {
    activeJobRef.current = "";
    resolveJobRef.current?.(false);
    resolveJobRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    workerModelRef.current = null;
    setProcessing(false);
    if (reloadModel) {
      setModelReady(false);
      modelProgressRef.current = 0;
      setModelProgress(0);
      createWorker(modelId);
    }
  };

  workerHandlerRef.current = (event) => {
    const message = event.data;
    if (message.modelId && message.modelId !== selectedModelRef.current) return;
    const activeModel = getModelOption(selectedModelRef.current);
    if (message.type === "model-progress") {
      const next = Math.max(0, Math.min(message.progress ?? 0, 1));
      const nextPhase = message.phase ?? (next >= 1 ? "loading" : "downloading");
      modelProgressRef.current = next;
      setModelProgress(next);
      setModelPhase(nextPhase);
      const loaded = Math.max(0, message.loaded ?? 0);
      const total = Math.max(0, message.total ?? 0);
      const now = performance.now();
      const previous = downloadSampleRef.current;
      const elapsedSeconds = Math.max(0, (now - previous.measuredAt) / 1000);
      let speed = previous.speed;
      let measuredLoaded = previous.loaded;
      let measuredAt = previous.measuredAt;
      if (loaded < previous.loaded) {
        speed = 0;
        measuredLoaded = loaded;
        measuredAt = now;
      }
      else if (elapsedSeconds >= 0.2 && loaded > previous.loaded) {
        const instantSpeed = (loaded - previous.loaded) / elapsedSeconds;
        speed = previous.speed > 0 ? previous.speed * 0.72 + instantSpeed * 0.28 : instantSpeed;
        measuredLoaded = loaded;
        measuredAt = now;
      }
      const eta = speed > 0 && total > loaded ? (total - loaded) / speed : next >= 1 ? 0 : null;
      downloadSampleRef.current = { loaded: measuredLoaded, measuredAt, speed, renderedAt: previous.renderedAt };
      if (now - previous.renderedAt >= 250 || next >= 1) {
        setDownloadStats({ loaded, total, speed, eta });
        downloadSampleRef.current.renderedAt = now;
      }
      if (!modelReady && !activeFileRef.current) {
        setStatus(nextPhase === "loading"
          ? tr(`Loading ${activeModel.shortLabel} into memory…`, `正在将${displayModel(activeModel.id)}加载到内存…`)
          : tr(`Downloading ${activeModel.shortLabel} · ${Math.round(next * 100)}%`, `正在下载${displayModel(activeModel.id)} · ${Math.round(next * 100)}%`));
      }
      return;
    }
    if (message.type === "model-phase") {
      const nextPhase = message.phase ?? "checking";
      setModelPhase(nextPhase);
      if (nextPhase === "loading") {
        modelProgressRef.current = 1;
        setModelProgress(1);
      }
      if (nextPhase === "checking") {
        setDownloadStats({ loaded: 0, total: 0, speed: 0, eta: null });
        downloadSampleRef.current = { loaded: 0, measuredAt: performance.now(), speed: 0, renderedAt: 0 };
      }
      if (!activeFileRef.current) {
        setStatus(nextPhase === "checking"
          ? tr("Checking model cache…", "正在检查模型缓存…")
          : tr(`Loading ${activeModel.shortLabel} into memory…`, `正在将${displayModel(activeModel.id)}加载到内存…`));
      }
      return;
    }
    if (message.type === "model-runtime") {
      setBackend(message.backend ?? "CPU");
      return;
    }
    if (message.type === "model-ready") {
      modelProgressRef.current = 1;
      setModelProgress(1);
      setModelPhase("ready");
      setModelReady(true);
      setModelChoiceReady(true);
      setModelChooserOpen(false);
      setBackend(message.backend ?? "WASM");
      if (!activeFileRef.current) setStatus(tr(`${activeModel.shortLabel} ready · ${message.backend ?? "WASM"}`, `${displayModel(activeModel.id)}已就绪 · ${message.backend ?? "WASM"}`));
      return;
    }
    if (message.type === "model-fallback") {
      setStatus(message.message ?? tr("Switching to CPU mode", "正在切换到 CPU 模式"));
      return;
    }
    if (message.type === "error" && !message.jobId) {
      setModelReady(false);
      setStatus(tr(`Model initialization failed · ${message.message ?? "Unknown error"}`, `模型初始化失败 · ${message.message ?? "未知错误"}`));
      showToast(tr("Model initialization failed. Reload to retry.", "模型初始化失败，请刷新页面后重试。"));
      return;
    }
    if (!message.jobId || message.jobId !== activeJobRef.current) return;
    if (message.type === "job-accepted") {
      setStatus(modelReady ? tr(`Starting ${activeModel.label} transcription…`, `正在使用${displayModel(activeModel.id)}开始转写…`) : tr("Audio ready · waiting for model initialization…", "音频已就绪 · 正在等待模型初始化…"));
      return;
    }
    if (message.type === "job-started") {
      setBackend(message.backend ?? backend);
      setStatus(tr(`Transcribing live · ${message.backend ?? backend}`, `正在实时转写 · ${message.backend ?? backend}`));
      return;
    }
    if (message.type === "partial") {
      const merged = mergeEntries(entriesRef.current, message.entries ?? []);
      replaceEntries(merged);
      setProgress(message.progress ?? 0);
      setStatus(tr(`Transcribing live · ${activeModel.shortLabel} · ${merged.length} passages ready`, `正在实时转写 · ${displayModel(activeModel.id)} · 已生成 ${merged.length} 条字幕`));
      const currentFile = activeFileRef.current;
      if (currentFile) {
        void writeTranscript(currentFile, merged, message.processedUntil ?? 0, false, activeModel.id);
      }
      return;
    }
    if (message.type === "complete") {
      const currentFile = activeFileRef.current;
      if (currentFile) {
        void writeTranscript(currentFile, entriesRef.current, message.processedUntil ?? duration, true, activeModel.id);
      }
      setProgress(1);
      setProcessing(false);
      setStatus(tr(`${activeModel.language === "ja" ? "Japanese" : "English"} transcript ready · ${entriesRef.current.length} passages`, `${activeModel.language === "ja" ? "日语" : "英语"}字幕已完成 · ${entriesRef.current.length} 条`));
      showToast(tr("Transcript ready and cached on this device", "字幕已完成并缓存在此设备中"));
      resolveJobRef.current?.(true);
      resolveJobRef.current = null;
      return;
    }
    if (message.type === "error") {
      setProcessing(false);
      setStatus(tr(`Transcription paused · ${message.message ?? "Unknown error"}`, `转写已暂停 · ${message.message ?? "未知错误"}`));
      showToast(tr("Transcription paused. Your completed subtitles remain saved.", "转写已暂停，已完成的字幕仍然保留。"));
      resolveJobRef.current?.(false);
      resolveJobRef.current = null;
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("echoscribe-theme");
    setDark(savedTheme === "dark");
    const savedUiLanguage = localStorage.getItem("echoscribe-ui-language");
    const initialUiLanguage: UiLanguage = savedUiLanguage === "zh" ? "zh" : "en";
    setUiLanguage(initialUiLanguage);
    const savedModel = localStorage.getItem("echoscribe-model");
    const initialModel = isModelId(savedModel) ? savedModel : null;
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    if (initialModel) {
      selectedModelRef.current = initialModel;
      setSelectedModelId(initialModel);
      setModelChoiceReady(true);
      createWorker(initialModel);
    } else {
      setModelChoiceReady(false);
      setSetupStep("model");
      setModelChooserOpen(true);
      setStatus(initialUiLanguage === "zh" ? "请选择转写语言和性能档位" : "Choose a language and performance level to begin");
    }
    return () => {
      workerRef.current?.terminate();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    document.documentElement.lang = uiLanguage === "zh" ? "zh-CN" : "en";
  }, [uiLanguage]);

  const beginTranscription = async (selectedFile: File, resumeAt: number, modelId: ModelId = selectedModelRef.current): Promise<boolean> => {
    const model = getModelOption(modelId);
    setProcessing(true);
    setProgress(duration ? Math.min(resumeAt / duration, 0.98) : 0.01);
    setStatus(resumeAt ? tr(`Resuming from ${formatTime(resumeAt)} · ${model.shortLabel}`, `正在从 ${formatTime(resumeAt)} 继续 · ${displayModel(model.id)}`) : tr("Preparing local audio…", "正在准备本地音频…"));
    try {
      const samples = await decodeAudio(selectedFile);
      const jobId = createJobId();
      activeJobRef.current = jobId;
      activeFileRef.current = selectedFile;
      const worker = ensureWorker(modelId);
      return await new Promise<boolean>((resolve) => {
        resolveJobRef.current = resolve;
        setStatus(modelReady && workerModelRef.current === modelId ? tr(`Starting ${model.label} transcription…`, `正在使用${displayModel(model.id)}开始转写…`) : tr("Audio decoded · waiting for model initialization…", "音频解码完成 · 正在等待模型初始化…"));
        worker.postMessage(
          { type: "transcribe", jobId, audio: samples, resumeAt, modelId },
          [samples.buffer],
        );
      });
    } catch (error) {
      setProcessing(false);
      setStatus(error instanceof Error ? error.message : tr("This audio could not be decoded", "无法解码此音频"));
      showToast(tr("This browser could not decode the selected audio", "当前浏览器无法解码所选音频"));
      return false;
    }
  };

  const openAudio = async (selectedFile: File, modelId: ModelId = selectedModelRef.current): Promise<boolean> => {
    if (!modelChoiceReady) {
      setModelChooserOpen(true);
      showToast(tr("Choose a transcription model first", "请先选择转写模型"));
      return false;
    }
    if (!selectedFile.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|flac|ogg|opus|webm|aif|aiff|caf|mp4)$/i.test(selectedFile.name)) {
      showToast(tr("Choose a supported audio file", "请选择受支持的音频文件"));
      return false;
    }
    if (processing) stopCurrentJob();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const nextUrl = URL.createObjectURL(selectedFile);
    setAudioUrl(nextUrl);
    setFile(selectedFile);
    activeFileRef.current = selectedFile;
    setPosition(0);
    setDuration(0);
    setSearch("");
    const cached = await readTranscript(selectedFile, modelId);
    if (cached) {
      replaceEntries(cached.entries);
      if (cached.complete) {
        setProgress(1);
        setStatus(tr(`Loaded cached transcript · ${cached.entries.length} passages`, `已加载缓存字幕 · ${cached.entries.length} 条`));
        showToast(tr("Cached transcript loaded instantly", "已直接加载缓存字幕"));
        return true;
      }
      const resumeAt = Math.max(cached.processedUntil, cached.entries[cached.entries.length - 1]?.end ?? 0);
      setStatus(tr(`Loaded ${cached.entries.length} saved passages · resuming`, `已加载 ${cached.entries.length} 条已保存字幕 · 正在继续`));
      return beginTranscription(selectedFile, resumeAt, modelId);
    }
    replaceEntries([]);
    setProgress(0);
    return beginTranscription(selectedFile, 0, modelId);
  };

  const handleAudioInput = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) void openAudio(selected);
    event.target.value = "";
  };

  const regenerate = async () => {
    if (!file) return;
    const modelId = selectedModelRef.current;
    stopCurrentJob(true, modelId);
    await deleteTranscript(file, modelId);
    replaceEntries([]);
    setProgress(0);
    showToast(tr(`Regenerating with ${getModelOption(modelId).label}`, `正在使用${displayModel(modelId)}重新生成字幕`));
    void beginTranscription(file, 0, modelId);
  };

  const chooseInitialModel = (modelId: ModelId) => {
    setPendingModelId(modelId);
    setSetupStep("language");
  };

  const completeInitialSetup = (language: UiLanguage) => {
    setUiLanguage(language);
    localStorage.setItem("echoscribe-ui-language", language);
    setStatus(language === "zh" ? "正在检查所选模型的缓存…" : "Checking the selected model cache…");
    void applyModelChoice(pendingModelId);
  };

  const applyModelChoice = async (nextModelId: ModelId) => {
    if (!isModelId(nextModelId)) return;
    if (nextModelId === selectedModelRef.current && (workerRef.current || modelReady)) {
      setModelChooserOpen(false);
      return;
    }
    stopCurrentJob(false);
    selectedModelRef.current = nextModelId;
    setSelectedModelId(nextModelId);
    setModelChoiceReady(true);
    setModelChooserOpen(false);
    localStorage.setItem("echoscribe-model", nextModelId);
    setModelReady(false);
    modelProgressRef.current = 0;
    setModelProgress(0);
    setModelPhase("checking");
    setBackend("Detecting");
    createWorker(nextModelId);
    const model = getModelOption(nextModelId);
    setStatus(tr(`Checking ${model.label} cache…`, `正在检查${displayModel(model.id)}的缓存…`));
    if (!file) return;
    const cached = await readTranscript(file, nextModelId);
    replaceEntries(cached?.entries ?? []);
    if (cached?.complete) {
      setProgress(1);
      setStatus(tr(`Loaded cached ${model.label} transcript · ${cached.entries.length} passages`, `已加载${displayModel(model.id)}的缓存字幕 · ${cached.entries.length} 条`));
      showToast(tr("Saved model choice and loaded its cached transcript", "已保存模型选择并加载对应缓存字幕"));
      return;
    }
    setProgress(0);
    const resumeAt = cached ? Math.max(cached.processedUntil, cached.entries[cached.entries.length - 1]?.end ?? 0) : 0;
    showToast(tr(`Saved model choice · ${model.label}`, `已保存模型选择 · ${displayModel(model.id)}`));
    void beginTranscription(file, resumeAt, nextModelId);
  };

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
    void applyModelChoice(event.target.value as ModelId);
  };

  const cancelModelLoading = () => {
    stopCurrentJob(false);
    localStorage.removeItem("echoscribe-model");
    setModelReady(false);
    setModelChoiceReady(false);
    setModelProgress(0);
    setModelPhase("checking");
    modelProgressRef.current = 0;
    setBackend("Detecting");
    setSetupStep("model");
    setModelChooserOpen(true);
    setStatus(tr("Model loading cancelled · choose another option", "模型加载已取消 · 请选择其他模型"));
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("echoscribe-theme", next ? "dark" : "light");
  };

  const toggleInterfaceLanguage = () => {
    const next: UiLanguage = uiLanguage === "en" ? "zh" : "en";
    setUiLanguage(next);
    localStorage.setItem("echoscribe-ui-language", next);
    if (processing) setStatus(next === "zh" ? "正在实时转写…" : "Transcribing live…");
    else if (modelChoiceReady && !modelReady) {
      if (modelPhase === "downloading") setStatus(next === "zh" ? `正在下载模型 · ${Math.round(modelProgress * 100)}%` : `Downloading model · ${Math.round(modelProgress * 100)}%`);
      else if (modelPhase === "loading") setStatus(next === "zh" ? "模型下载完成 · 正在加载到内存…" : "Download complete · loading model into memory…");
      else setStatus(next === "zh" ? "正在检查模型缓存…" : "Checking model cache…");
    } else if (entriesRef.current.length) setStatus(next === "zh" ? `已生成 ${entriesRef.current.length} 条字幕` : `${entriesRef.current.length} passages ready`);
    else if (modelReady) setStatus(next === "zh" ? `模型已就绪 · ${backend}` : `Model ready · ${backend}`);
    else setStatus(next === "zh" ? "打开音频文件即可开始" : "Open an audio file to begin");
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      inputRef.current?.click();
      return;
    }
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const seekAndPlay = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, Math.min(seconds, audio.duration || seconds));
    const targetVolume = volume;
    audio.volume = 0;
    audio.currentTime = target;
    void audio.play();
    window.setTimeout(() => {
      audio.volume = targetVolume;
    }, 120);
  };

  const moveBy = (seconds: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, audio.duration));
  };

  const filteredEntries = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return needle
      ? entries.filter((entry) => entry.text.toLocaleLowerCase().includes(needle))
      : entries;
  }, [entries, search]);

  const exportText = () => {
    if (!file || !entries.length) return;
    downloadFile(
      `${file.name.replace(/\.[^.]+$/, "")}.txt`,
      entries.map((entry) => entry.text).join("\n"),
      "text/plain;charset=utf-8",
    );
  };

  const exportSrt = () => {
    if (!file || !entries.length) return;
    const stamp = (seconds: number) => {
      const milliseconds = Math.round(seconds * 1000);
      const hours = Math.floor(milliseconds / 3600000);
      const minutes = Math.floor((milliseconds % 3600000) / 60000);
      const secs = Math.floor((milliseconds % 60000) / 1000);
      const millis = milliseconds % 1000;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
    };
    const content = entries
      .map((entry, index) => `${index + 1}\n${stamp(entry.start)} --> ${stamp(entry.end)}\n${entry.text}`)
      .join("\n\n");
    downloadFile(`${file.name.replace(/\.[^.]+$/, "")}.srt`, content, "text/plain;charset=utf-8");
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const selected = event.dataTransfer.files?.[0];
    if (selected) void openAudio(selected);
  };

  const selectedModel = getModelOption(selectedModelId);
  const fileKind = file
    ? `${file.name.split(".").pop()?.toUpperCase() ?? "AUDIO"} AUDIO`
    : `${selectedModel.language === "ja" ? copy.japanese : copy.english} · ${copy.audioWorkspace}`;
  const modelStateLabel = modelReady
    ? backend
    : modelPhase === "downloading"
      ? `↓ ${Math.round(modelProgress * 100)}%`
      : modelPhase === "loading"
        ? copy.loadingModel
        : copy.checkingModel;
  const modelLoaderTitle = modelPhase === "downloading"
    ? `${copy.downloadingModel} · ${displayModel(selectedModel.id)}`
    : modelPhase === "loading"
      ? `${copy.loadingModel} · ${displayModel(selectedModel.id)}`
      : copy.checkingModel;
  const modelLoaderHint = modelPhase === "downloading"
    ? copy.downloadingHint
    : modelPhase === "loading"
      ? copy.loadingHint
      : copy.checkingHint;
  const downloadedSizeLabel = downloadStats.total > 0
    ? `${formatBytes(downloadStats.loaded)} / ${formatBytes(downloadStats.total)}`
    : "—";
  const downloadSpeedLabel = modelPhase === "downloading" && downloadStats.speed > 0
    ? `${formatBytes(downloadStats.speed)}/s`
    : "—";
  const waitingTimeLabel = modelPhase === "loading" || modelPhase === "ready"
    ? copy.downloadComplete
    : downloadStats.eta === null
      ? copy.calculating
      : formatDuration(downloadStats.eta);

  return (
    <div className={dark ? "app dark" : "app"} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}echoscribe-icon.png`} alt="" />
          <span>EchoScribe</span>
        </div>
        <div className="top-actions">
          <a
            className="quiet windows-download"
            href="https://github.com/khanomajmeri44-ctrl/EchoScribe-Web/releases/download/v1.2.0/EchoScribe-1.2.0-SelfExtracting.exe"
            download
            title={copy.downloadWindows}
          >
            {copy.downloadWindows}
          </a>
          <button className="quiet language-toggle" aria-label={copy.switchLanguage} title={copy.switchLanguage} onClick={toggleInterfaceLanguage}>
            <span>A</span><i>/</i><span>文</span>
          </button>
          <button className="quiet" onClick={toggleTheme}>{dark ? copy.light : copy.dark}</button>
          <button className="quiet regenerate-button" disabled={!modelChoiceReady || !file} onClick={() => void regenerate()}>{copy.regenerate}</button>
          <label className="model-pill">
            <select aria-label="Transcription model" value={selectedModelId} onChange={(event) => void handleModelChange(event)}>
              <optgroup label={copy.englishModels}>
                {MODEL_OPTIONS.filter((model) => model.language === "en").map((model, index) => (
                  <option key={model.id} value={model.id}>{copy.english} · {copy.levels[index]} — {copy.memory[index]}</option>
                ))}
              </optgroup>
              <optgroup label={copy.japaneseModels}>
                {MODEL_OPTIONS.filter((model) => model.language === "ja").map((model, index) => (
                  <option key={model.id} value={model.id}>{copy.japanese} · {copy.levels[index]} — {copy.memory[index]}</option>
                ))}
              </optgroup>
            </select>
            <span className="model-state">{modelStateLabel}</span>
            <span className="model-dot" />
          </label>
          <button className="solid" disabled={!modelChoiceReady} onClick={() => inputRef.current?.click()}>{copy.openAudio}</button>
        </div>
        <input ref={inputRef} className="hidden-input" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm,.aif,.aiff,.caf,.mp4" onChange={handleAudioInput} />
      </header>

      {modelChoiceReady && !modelReady && (
        <aside className="model-loader" role="status" aria-live="polite">
          <div className="model-loader-copy">
            <strong>{modelLoaderTitle}</strong>
            <span>{modelPhase === "downloading" ? `${Math.round(modelProgress * 100)}%` : "•••"}</span>
          </div>
          <p className="model-loader-hint">{modelLoaderHint}</p>
          <div className={modelPhase === "downloading" ? "model-loader-track" : "model-loader-track indeterminate"} aria-hidden="true">
            <span style={modelPhase === "downloading" ? { width: `${modelProgress * 100}%` } : undefined} />
          </div>
          <div className="model-download-stats">
            <div><span>{copy.downloadedSize}</span><strong>{downloadedSizeLabel}</strong></div>
            <div><span>{copy.downloadSpeed}</span><strong>{downloadSpeedLabel}</strong></div>
            <div><span>{copy.waitingTime}</span><strong>{waitingTimeLabel}</strong></div>
          </div>
          <button onClick={cancelModelLoading}>{copy.cancelAndChoose}</button>
        </aside>
      )}

      {modelChooserOpen && (
        <div className="model-dialog-backdrop" role="presentation">
          <section className={setupStep === "language" ? "model-dialog language-dialog" : "model-dialog"} role="dialog" aria-modal="true" aria-labelledby="model-dialog-title">
            {setupStep === "model" ? (
              <>
                <div className="model-dialog-heading">
                  <div>
                    <div className="eyebrow">{copy.firstTimeSetup}</div>
                    <h2 id="model-dialog-title">{copy.chooseLevel}</h2>
                  </div>
                  <p>{copy.modelSaved}</p>
                </div>
                {(["en", "ja"] as const).map((language) => (
                  <div className="model-language-group" key={language}>
                    <h3>{language === "en" ? copy.english : copy.japanese}</h3>
                    <div className="model-choice-grid">
                      {MODEL_OPTIONS.filter((model) => model.language === language).map((model, index) => (
                        <button key={model.id} className="model-choice" onClick={() => chooseInitialModel(model.id)}>
                          <span className="model-choice-top"><strong>{copy.levels[index]}</strong>{index === 0 && <em>{copy.recommended}</em>}</span>
                          <span>{copy.memory[index]}</span>
                          <small>{copy.recommendations[index]}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="model-dialog-note">{copy.higherLevels}</p>
              </>
            ) : (
              <>
                <div className="model-dialog-heading language-dialog-heading">
                  <div>
                    <div className="eyebrow">2 / 2 · A / 文</div>
                    <h2 id="model-dialog-title">选择界面语言 / Choose interface language</h2>
                  </div>
                  <p>选择会保存在此浏览器中 / Your choice is saved in this browser.</p>
                </div>
                <div className="language-choice-grid">
                  <button className="language-choice" onClick={() => completeInitialSetup("zh")}>
                    <span className="language-choice-mark">文</span>
                    <strong>{COPY.zh.chineseInterface}</strong>
                    <small>{COPY.zh.chineseInterfaceHint}</small>
                  </button>
                  <button className="language-choice" onClick={() => completeInitialSetup("en")}>
                    <span className="language-choice-mark">A</span>
                    <strong>{COPY.en.englishInterface}</strong>
                    <small>{COPY.en.englishInterfaceHint}</small>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <main className="workspace">
        <section className="player-card">
          <div className="file-heading">
            <div className="eyebrow">{fileKind}</div>
            <h1>{file?.name ?? `${copy.openAnAudio} · ${selectedModel.language === "ja" ? copy.japanese : copy.english}`}</h1>
            <p>{status}</p>
          </div>

          <div className="wave-card">
            <div className="waveform" aria-hidden="true">
              {WAVEFORM.map((height, index) => <span key={index} style={{ height }} />)}
            </div>
            <div className="wave-caption">
              <span>{copy.browserAudio}</span>
              <span className="privacy-dot">{copy.onDevice}</span>
            </div>
          </div>

          {audioUrl ? (
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              playsInline
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          ) : null}

          <div className="timeline">
            <input
              aria-label={uiLanguage === "zh" ? "音频进度" : "Audio position"}
              type="range"
              min="0"
              max={duration || 1}
              step="0.01"
              value={Math.min(position, duration || 1)}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (audioRef.current) audioRef.current.currentTime = next;
                setPosition(next);
              }}
              style={{ "--range-progress": `${duration ? (position / duration) * 100 : 0}%` } as CSSProperties}
            />
            <div className="time-row"><span>{formatTime(position)}</span><span>{formatTime(duration)}</span></div>
          </div>

          <div className="transport-row">
            <button className="round" aria-label={copy.back10} onClick={() => moveBy(-10)}>−10</button>
            <button className="play" aria-label={playing ? copy.pauseAudio : copy.playAudio} onClick={togglePlayback}>{playing ? "Ⅱ" : "▶"}</button>
            <button className="round" aria-label={copy.forward10} onClick={() => moveBy(10)}>+10</button>
            <div className="volume-control">
              <span>{copy.volume}</span>
              <input aria-label={copy.volume} type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
            </div>
          </div>

          <div className="local-note">
            <div><span className="shield">✓</span><strong>{copy.privateTitle}</strong></div>
            <p>{copy.privateBody}</p>
          </div>
        </section>

        <section className="transcript-card">
          <div className="transcript-header">
            <div><h2>{copy.transcript}</h2><p>{copy.transcriptSubtitle}</p></div>
            <div className="export-actions">
              <button className="quiet compact" disabled={!entries.length} onClick={exportText}>TXT</button>
              <button className="quiet compact" disabled={!entries.length} onClick={exportSrt}>SRT</button>
            </div>
          </div>
          <div className="search-wrap">
            <span>⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchTranscript} aria-label={copy.searchTranscript} />
          </div>
          <div className="transcription-progress"><span style={{ width: `${progress * 100}%` }} /></div>
          <div className="transcript-list">
            {!filteredEntries.length && (
              <div className="empty-state">
                <div className="empty-mark">Aa</div>
                <h3>{processing ? `${copy.listening} ${selectedModel.language === "ja" ? copy.japanese : copy.english} ${copy.speech}` : copy.transcriptEmpty}</h3>
                <p>{modelReady ? copy.openOrDrop : copy.modelCaching}</p>
              </div>
            )}
            {filteredEntries.map((entry, index) => {
              const active = position >= entry.start && position < entry.end;
              return (
                <button key={`${entry.start}-${index}`} className={active ? "transcript-row active" : "transcript-row"} onClick={() => seekAndPlay(entry.start)}>
                  <span className="row-time">{formatTime(entry.start)}</span>
                  <span className={textHidden ? "row-text hidden-text" : "row-text"}>{entry.text}</span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <div className="floating-tools">
        <button aria-label={textHidden ? copy.showSubtitles : copy.hideSubtitles} onClick={() => setTextHidden((value) => !value)}>{textHidden ? "Aa" : "A̶a̶"}</button>
        <button aria-label={playing ? copy.pauseAudio : copy.continueAudio} onClick={togglePlayback}>{playing ? "Ⅱ" : "▶"}</button>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
