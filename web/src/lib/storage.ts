import { randomUUID, createHash } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

type StorageArea = "listing-media" | "transaction-documents" | "logbooks";

// Preserve existing database keys and volume paths. Only listing media is public.
const directories: Record<StorageArea, string[]> = {
    "listing-media": ["public"],
    "transaction-documents": [".data", "transaction-documents"],
    logbooks: [".data"],
};

export function storagePath(area: StorageArea, key: string, root = process.cwd()) {
    const segments = key.split("/");
    if (segments.some((segment) => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(segment))
        || segments.some((segment) => segment.endsWith("."))) {
        throw new Error("Invalid storage key");
    }
    if (area === "listing-media" && !["uploads", "dev"].includes(segments[0])) {
        throw new Error("Invalid listing media key");
    }
    if (area === "logbooks" && segments[0] !== "logbooks") {
        throw new Error("Invalid logbook key");
    }
    return path.join(root, ...directories[area], ...segments);
}

export async function storeFile(area: StorageArea, key: string, bytes: Uint8Array) {
    if (area === "listing-media" && !key.startsWith("uploads/")) {
        throw new Error("Only uploaded listing media can be written");
    }
    const target = storagePath(area, key);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.upload-${randomUUID()}`);
    try {
        await writeFile(temporary, bytes, { flag: "wx", mode: area === "listing-media" ? 0o644 : 0o600 });
        // A hard link publishes complete bytes atomically and refuses to overwrite a key.
        // Both paths live on the same persistent volume.
        await link(temporary, target);
    } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
        });
    }
}

export async function readStoredFile(area: StorageArea, key: string) {
    return readFile(storagePath(area, key));
}

export async function deleteStoredFile(area: StorageArea, key: string) {
    await unlink(storagePath(area, key)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
    });
}

/** Call only after checking that the current user owns the READY media record. */
export async function readEstimatorImage(image: { storageKey: string; sha256: string }) {
    const bytes = await readStoredFile("listing-media", image.storageKey);
    if (createHash("sha256").update(bytes).digest("hex") !== image.sha256.toLowerCase()) {
        throw new Error("Stored image checksum does not match its media record");
    }
    return bytes;
}
