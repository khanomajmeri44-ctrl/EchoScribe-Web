export const MODEL_OPTIONS = [
  { id: "en-tiny", label: "English · Fast", shortLabel: "EN Fast", repo: "onnx-community/whisper-tiny.en", language: "en", tier: "Low memory", recommendation: "Recommended for 4 GB RAM, older CPUs, and integrated graphics" },
  { id: "en-base", label: "English · Balanced", shortLabel: "EN Balanced", repo: "onnx-community/whisper-base.en", language: "en", tier: "Medium memory", recommendation: "Recommended for 8 GB RAM and 8th-gen i5 or newer" },
  { id: "en-small", label: "English · Advanced", shortLabel: "EN Advanced", repo: "onnx-community/whisper-small.en", language: "en", tier: "High memory", recommendation: "Recommended for 16 GB RAM and modern WebGPU hardware" },
  { id: "ja-tiny", label: "日本語 · 高速", shortLabel: "JA Fast", repo: "onnx-community/whisper-tiny", language: "ja", tier: "Low memory", recommendation: "4 GB RAM・旧世代CPU・内蔵GPU向け" },
  { id: "ja-base", label: "日本語 · 標準", shortLabel: "JA Balanced", repo: "onnx-community/whisper-base", language: "ja", tier: "Medium memory", recommendation: "8 GB RAM・第8世代i5以上を推奨" },
  { id: "ja-small", label: "日本語 · 高精度", shortLabel: "JA Advanced", repo: "onnx-community/whisper-small", language: "ja", tier: "High memory", recommendation: "16 GB RAM・新しいWebGPU対応環境を推奨" },
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
