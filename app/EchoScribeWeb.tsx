"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from "react";
import {
  deleteTranscript,
  readTranscript,
  TranscriptEntry,
  writeTranscript,
} from "@/lib/transcript-cache";

type WorkerEvent = {
  type: string;
  jobId?: string;
  backend?: string;
  message?: string;
  progress?: number;
  processedUntil?: number;
  entries?: TranscriptEntry[];
};

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
  const sourceContext = new AudioContext();
  const decoded = await sourceContext.decodeAudioData(await file.arrayBuffer());
  await sourceContext.close();
  const length = Math.max(1, Math.ceil(decoded.duration * 16000));
  const offline = new OfflineAudioContext(1, length, 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
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
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Open an audio file to begin");
  const [modelProgress, setModelProgress] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [backend, setBackend] = useState("Detecting");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.82);
  const [textHidden, setTextHidden] = useState(false);
  const [toast, setToast] = useState("");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerHandlerRef = useRef<(event: MessageEvent<WorkerEvent>) => void>(() => undefined);
  const activeJobRef = useRef("");
  const activeFileRef = useRef<File | null>(null);
  const entriesRef = useRef<TranscriptEntry[]>([]);
  const resolveJobRef = useRef<((success: boolean) => void) | null>(null);
  const modelProgressRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const replaceEntries = (value: TranscriptEntry[]) => {
    entriesRef.current = value;
    setEntries(value);
  };

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2600);
  };

  const createWorker = () => {
    const worker = new Worker(new URL("../workers/transcriber.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => workerHandlerRef.current(event);
    worker.postMessage({ type: "load" });
    workerRef.current = worker;
    return worker;
  };

  const ensureWorker = () => workerRef.current ?? createWorker();

  const stopCurrentJob = (reloadModel = true) => {
    activeJobRef.current = "";
    resolveJobRef.current?.(false);
    resolveJobRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    setProcessing(false);
    if (reloadModel) {
      setModelReady(false);
      modelProgressRef.current = 0;
      setModelProgress(0);
      createWorker();
    }
  };

  workerHandlerRef.current = (event) => {
    const message = event.data;
    if (message.type === "model-progress") {
      const next = Math.max(modelProgressRef.current, message.progress ?? 0);
      modelProgressRef.current = next;
      setModelProgress(next);
      if (!modelReady && !activeFileRef.current) {
        setStatus(next >= 1 ? "Initializing transcription engine…" : `Caching tiny.en model · ${Math.round(next * 100)}%`);
      }
      return;
    }
    if (message.type === "model-runtime") {
      if (!activeFileRef.current) setStatus(`Initializing ${message.backend ?? "CPU"} runtime…`);
      return;
    }
    if (message.type === "model-ready") {
      modelProgressRef.current = 1;
      setModelProgress(1);
      setModelReady(true);
      setBackend(message.backend ?? "WASM");
      if (!activeFileRef.current) setStatus(`tiny.en ready · ${message.backend ?? "WASM"}`);
      return;
    }
    if (message.type === "model-fallback") {
      setStatus(message.message ?? "Switching to CPU mode");
      return;
    }
    if (message.type === "error" && !message.jobId) {
      setModelReady(false);
      setStatus(`Model initialization failed · ${message.message ?? "Unknown error"}`);
      showToast("Model initialization failed. Reload to retry.");
      return;
    }
    if (!message.jobId || message.jobId !== activeJobRef.current) return;
    if (message.type === "job-accepted") {
      setStatus(modelReady ? "Starting English transcription…" : "Audio ready · waiting for model initialization…");
      return;
    }
    if (message.type === "job-started") {
      setBackend(message.backend ?? backend);
      setStatus(`Transcribing live · ${message.backend ?? backend}`);
      return;
    }
    if (message.type === "partial") {
      const merged = mergeEntries(entriesRef.current, message.entries ?? []);
      replaceEntries(merged);
      setProgress(message.progress ?? 0);
      setStatus(`Transcribing live · tiny.en · ${merged.length} sentences ready`);
      const currentFile = activeFileRef.current;
      if (currentFile) {
        void writeTranscript(currentFile, merged, message.processedUntil ?? 0, false);
      }
      return;
    }
    if (message.type === "complete") {
      const currentFile = activeFileRef.current;
      if (currentFile) {
        void writeTranscript(currentFile, entriesRef.current, message.processedUntil ?? duration, true);
      }
      setProgress(1);
      setProcessing(false);
      setStatus(`English transcript ready · ${entriesRef.current.length} sentences`);
      showToast("Transcript ready and cached on this device");
      resolveJobRef.current?.(true);
      resolveJobRef.current = null;
      return;
    }
    if (message.type === "error") {
      setProcessing(false);
      setStatus(`Transcription paused · ${message.message ?? "Unknown error"}`);
      showToast("Transcription paused. Your completed subtitles remain saved.");
      resolveJobRef.current?.(false);
      resolveJobRef.current = null;
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("echoscribe-theme");
    setDark(savedTheme === "dark");
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    if (navigator.storage?.persist) void navigator.storage.persist();
    createWorker();
    return () => {
      workerRef.current?.terminate();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const beginTranscription = async (selectedFile: File, resumeAt: number): Promise<boolean> => {
    setProcessing(true);
    setProgress(duration ? Math.min(resumeAt / duration, 0.98) : 0.01);
    setStatus(resumeAt ? `Resuming from ${formatTime(resumeAt)} · tiny.en` : "Preparing local audio…");
    try {
      const samples = await decodeAudio(selectedFile);
      const jobId = crypto.randomUUID();
      activeJobRef.current = jobId;
      activeFileRef.current = selectedFile;
      const worker = ensureWorker();
      return await new Promise<boolean>((resolve) => {
        resolveJobRef.current = resolve;
        setStatus(modelReady ? "Starting English transcription…" : "Audio decoded · waiting for model initialization…");
        worker.postMessage(
          { type: "transcribe", jobId, audio: samples, resumeAt },
          [samples.buffer],
        );
      });
    } catch (error) {
      setProcessing(false);
      setStatus(error instanceof Error ? error.message : "This audio could not be decoded");
      showToast("This browser could not decode the selected audio");
      return false;
    }
  };

  const openAudio = async (selectedFile: File, batchMode = false): Promise<boolean> => {
    if (!selectedFile.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|flac|ogg|opus|webm)$/i.test(selectedFile.name)) {
      showToast("Choose a supported audio file");
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
    const cached = await readTranscript(selectedFile);
    if (cached) {
      replaceEntries(cached.entries);
      if (cached.complete) {
        setProgress(1);
        setStatus(`Loaded cached transcript · ${cached.entries.length} sentences`);
        if (!batchMode) showToast("Cached transcript loaded instantly");
        return true;
      }
      const resumeAt = cached.entries.at(-1)?.end ?? 0;
      setStatus(`Loaded ${cached.entries.length} saved sentences · resuming`);
      return beginTranscription(selectedFile, resumeAt);
    }
    replaceEntries([]);
    setProgress(0);
    return beginTranscription(selectedFile, 0);
  };

  const handleAudioInput = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) void openAudio(selected);
    event.target.value = "";
  };

  const handleBatchInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    setBatchProcessing(true);
    setBatchProgress(0);
    let completed = 0;
    for (const item of selected) {
      await openAudio(item, true);
      completed += 1;
      setBatchProgress(completed / selected.length);
    }
    setBatchProcessing(false);
    showToast(`Batch complete · ${completed} audio files cached`);
  };

  const regenerate = async () => {
    if (!file) return;
    stopCurrentJob();
    await deleteTranscript(file);
    replaceEntries([]);
    setProgress(0);
    showToast("Regenerating subtitles with tiny.en");
    void beginTranscription(file, 0);
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("echoscribe-theme", next ? "dark" : "light");
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

  const fileKind = file ? `${file.name.split(".").at(-1)?.toUpperCase() ?? "AUDIO"} AUDIO` : "ENGLISH AUDIO WORKSPACE";
  const modelLabel = modelReady
    ? `tiny.en · ${backend}`
    : `Model ${Math.round(modelProgress * 100)}%`;

  return (
    <div className={dark ? "app dark" : "app"} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}echoscribe-icon.png`} alt="" />
          <span>EchoScribe</span>
        </div>
        <div className="top-actions">
          <button className="quiet batch-button" disabled={processing || batchProcessing} onClick={() => batchInputRef.current?.click()}>
            {batchProcessing ? `Batch ${Math.round(batchProgress * 100)}%` : "Batch scan"}
            {batchProcessing && <span className="button-progress" style={{ width: `${batchProgress * 100}%` }} />}
          </button>
          <button className="quiet" onClick={toggleTheme}>{dark ? "Light" : "Dark"}</button>
          <button className="quiet" disabled={!file || batchProcessing} onClick={() => void regenerate()}>Regenerate</button>
          <button className="model-pill" aria-label="Lightweight transcription model" disabled>
            <span>{modelLabel}</span><span className="model-dot" />
          </button>
          <button className="solid" onClick={() => inputRef.current?.click()}>Open audio</button>
        </div>
        <input ref={inputRef} className="hidden-input" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm" onChange={handleAudioInput} />
        <input ref={batchInputRef} className="hidden-input" type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm" onChange={(event) => void handleBatchInput(event)} />
      </header>

      <main className="workspace">
        <section className="player-card">
          <div className="file-heading">
            <div className="eyebrow">{fileKind}</div>
            <h1>{file?.name ?? "Open an English audio file"}</h1>
            <p>{status}</p>
          </div>

          <div className="wave-card">
            <div className="waveform" aria-hidden="true">
              {WAVEFORM.map((height, index) => <span key={index} style={{ height }} />)}
            </div>
            <div className="wave-caption">
              <span>Browser-synchronized audio</span>
              <span className="privacy-dot">On-device only</span>
            </div>
          </div>

          {audioUrl ? (
            <audio
              ref={audioRef}
              src={audioUrl}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          ) : null}

          <div className="timeline">
            <input
              aria-label="Audio position"
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
            <button className="round" aria-label="Back 10 seconds" onClick={() => moveBy(-10)}>−10</button>
            <button className="play" aria-label={playing ? "Pause audio" : "Play audio"} onClick={togglePlayback}>{playing ? "Ⅱ" : "▶"}</button>
            <button className="round" aria-label="Forward 10 seconds" onClick={() => moveBy(10)}>+10</button>
            <div className="volume-control">
              <span>Volume</span>
              <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
            </div>
          </div>

          <div className="local-note">
            <div><span className="shield">✓</span><strong>Private by design</strong></div>
            <p>Your audio never leaves this device. The tiny.en model is cached by this browser.</p>
          </div>
        </section>

        <section className="transcript-card">
          <div className="transcript-header">
            <div><h2>Transcript</h2><p>New passages appear here while the audio is transcribed</p></div>
            <div className="export-actions">
              <button className="quiet compact" disabled={!entries.length} onClick={exportText}>TXT</button>
              <button className="quiet compact" disabled={!entries.length} onClick={exportSrt}>SRT</button>
            </div>
          </div>
          <div className="search-wrap">
            <span>⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transcript" aria-label="Search transcript" />
          </div>
          <div className="transcription-progress"><span style={{ width: `${progress * 100}%` }} /></div>
          <div className="transcript-list">
            {!filteredEntries.length && (
              <div className="empty-state">
                <div className="empty-mark">Aa</div>
                <h3>{processing ? "Listening for English speech…" : "Your transcript will appear here"}</h3>
                <p>{modelReady ? "Open or drop an audio file to begin local transcription." : "The lightweight model is being cached for first use."}</p>
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
        <button aria-label={textHidden ? "Show subtitle text" : "Hide subtitle text"} onClick={() => setTextHidden((value) => !value)}>{textHidden ? "Aa" : "A̶a̶"}</button>
        <button aria-label={playing ? "Pause audio" : "Continue audio"} onClick={togglePlayback}>{playing ? "Ⅱ" : "▶"}</button>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
