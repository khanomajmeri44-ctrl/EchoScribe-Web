export type TranscriptEntry = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptCache = {
  key: string;
  model: string;
  complete: boolean;
  processedUntil: number;
  entries: TranscriptEntry[];
  updatedAt: number;
};

const DATABASE = "echoscribe-web";
const STORE = "transcripts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transcriptKey(file: File, model: string): string {
  return `${file.name}:${file.size}:${file.lastModified}:${model}`;
}

export async function readTranscript(file: File, model: string): Promise<TranscriptCache | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(transcriptKey(file, model));
    request.onsuccess = () => resolve((request.result as TranscriptCache | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function writeTranscript(
  file: File,
  entries: TranscriptEntry[],
  processedUntil: number,
  complete: boolean,
  model: string,
): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({
      key: transcriptKey(file, model),
      model,
      complete,
      processedUntil,
      entries,
      updatedAt: Date.now(),
    } satisfies TranscriptCache);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteTranscript(file: File, model: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(transcriptKey(file, model));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
