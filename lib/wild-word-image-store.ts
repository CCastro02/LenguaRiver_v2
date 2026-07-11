/**
 * IndexedDB storage for user-uploaded My Words card images (blobs only — never localStorage).
 */

const DB_NAME = "lenguariver_v1";
const DB_VERSION = 1;
const STORE_NAME = "wild_word_images";

export type WildWordImageMeta = {
  wordId?: string;
  mimeType?: string;
};

type StoredWildWordImage = {
  id: string;
  blob: Blob;
  mimeType: string;
  wordId?: string;
  createdAt: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB is only available in the browser."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open image database."));
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
    });
  }
  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onerror = () => {
          reject(request.error ?? new Error("Image database request failed."));
        };
        request.onsuccess = () => {
          resolve(request.result as T);
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error("Image database transaction failed."));
        };
      })
  );
}

export type ResizeImageFileOptions = {
  maxDimension?: number;
  quality?: number;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file."));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not encode image."));
        }
      },
      type,
      quality
    );
  });
}

/**
 * Resize/compress an image file for local storage (max dimension, WebP preferred).
 */
export async function resizeImageFile(
  file: File,
  options?: ResizeImageFileOptions
): Promise<Blob> {
  if (!isBrowser()) {
    throw new Error("Image resize is only available in the browser.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("File is not an image.");
  }

  const maxDimension = options?.maxDimension ?? 512;
  const quality = options?.quality ?? 0.85;

  const img = await loadImageFromFile(file);
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create image canvas.");
  }
  ctx.drawImage(img, 0, 0, width, height);

  const webpSupported =
    typeof canvas.toDataURL === "function" && canvas.toDataURL("image/webp").startsWith("data:image/webp");

  if (webpSupported) {
    try {
      return await canvasToBlob(canvas, "image/webp", quality);
    } catch {
      /* fall through */
    }
  }

  if (file.type === "image/png") {
    return canvasToBlob(canvas, "image/png", quality);
  }

  return canvasToBlob(canvas, "image/jpeg", quality);
}

/** Persist a resized image blob under `id`. */
export async function putWildWordImage(
  id: string,
  blob: Blob,
  meta?: WildWordImageMeta
): Promise<void> {
  const record: StoredWildWordImage = {
    id,
    blob,
    mimeType: meta?.mimeType ?? (blob.type || "image/jpeg"),
    wordId: meta?.wordId,
    createdAt: new Date().toISOString(),
  };
  await runTransaction("readwrite", (store) => store.put(record));
}

/** Load a stored image blob, or null if missing. */
export async function getWildWordImage(id: string): Promise<Blob | null> {
  const record = await runTransaction<StoredWildWordImage | undefined>("readonly", (store) =>
    store.get(id)
  );
  if (!record?.blob) {
    return null;
  }
  return record.blob;
}

/** Remove one stored image by id. */
export async function deleteWildWordImage(id: string): Promise<void> {
  await runTransaction("readwrite", (store) => store.delete(id));
}
