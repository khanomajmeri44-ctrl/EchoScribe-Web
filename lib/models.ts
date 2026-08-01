export const MODEL_OPTIONS = [
  { id: "en-tiny", label: "English · Fast", shortLabel: "EN Fast", repo: "onnx-community/whisper-tiny.en", language: "en", tier: "Low memory" },
  { id: "en-base", label: "English · Balanced", shortLabel: "EN Balanced", repo: "onnx-community/whisper-base.en", language: "en", tier: "Medium memory" },
  { id: "en-small", label: "English · Advanced", shortLabel: "EN Advanced", repo: "onnx-community/whisper-small.en", language: "en", tier: "High memory" },
  { id: "ja-tiny", label: "日本語 · 高速", shortLabel: "JA Fast", repo: "onnx-community/whisper-tiny", language: "ja", tier: "Low memory" },
  { id: "ja-base", label: "日本語 · 標準", shortLabel: "JA Balanced", repo: "onnx-community/whisper-base", language: "ja", tier: "Medium memory" },
  { id: "ja-small", label: "日本語 · 高精度", shortLabel: "JA Advanced", repo: "onnx-community/whisper-small", language: "ja", tier: "High memory" },
] as const;

export type ModelId = (typeof MODEL_OPTIONS)[number]["id"];
export type ModelOption = (typeof MODEL_OPTIONS)[number];

export const DEFAULT_MODEL_ID: ModelId = "en-tiny";

export function getModelOption(id: string): ModelOption {
  return MODEL_OPTIONS.find((model) => model.id === id) ?? MODEL_OPTIONS[0];
}

export function isModelId(id: string | null): id is ModelId {
  return MODEL_OPTIONS.some((model) => model.id === id);
}
