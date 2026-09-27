import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { deleteStoredFile, readEstimatorImage, readStoredFile, storagePath, storeFile } from "../src/lib/storage";

test("storage keys cannot escape their area or name arbitrary public files", () => {
    for (const key of ["../secret", "room/../../secret", "/etc/passwd", "C:/secret", "room\\secret", "room//file", "room/%2e%2e/file", "room/file?x", "room/file."]) {
        assert.throws(() => storagePath("transaction-documents", key), /Invalid/);
    }
    assert.throws(() => storagePath("listing-media", "favicon.ico"), /Invalid/);
    assert.throws(() => storagePath("listing-media", ".data/secret"), /Invalid/);
    assert.throws(() => storagePath("logbooks", "transaction-documents/file.pdf"), /Invalid/);
    assert.equal(storagePath("listing-media", "dev/listings/demo/photo-1.png"), path.join(process.cwd(), "public/dev/listings/demo/photo-1.png"));
});

test("files remain isolated, cannot be overwritten, and estimator verifies stored content", async () => {
    const previous = process.cwd();
    const root = await mkdtemp(path.join(os.tmpdir(), "zelfwonen-storage-"));
    process.chdir(root);
    try {
        const bytes = Buffer.from("test photo bytes");
        const key = "uploads/listing/photo.jpg";
        await storeFile("listing-media", key, bytes);
        await assert.rejects(storeFile("listing-media", key, Buffer.from("replacement")), { code: "EEXIST" });
        assert.deepEqual(await readStoredFile("listing-media", key), bytes);
        assert.deepEqual(await readdir(path.dirname(storagePath("listing-media", key))), ["photo.jpg"]);
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        assert.deepEqual(await readEstimatorImage({ storageKey: key, sha256 }), bytes);
        await assert.rejects(readEstimatorImage({ storageKey: key, sha256: "0".repeat(64) }), /checksum/);
        await assert.rejects(storeFile("listing-media", "dev/file.jpg", bytes), /Only uploaded/);

        await storeFile("transaction-documents", "room/document.pdf", bytes);
        await storeFile("logbooks", "logbooks/listing/export.pdf", bytes);
        assert.deepEqual(await readdir(path.join(root, "public")), ["uploads"]);
        assert.deepEqual(await readStoredFile("transaction-documents", "room/document.pdf"), bytes);
        assert.deepEqual(await readStoredFile("logbooks", "logbooks/listing/export.pdf"), bytes);
        await deleteStoredFile("listing-media", key);
        await deleteStoredFile("listing-media", key);
        await assert.rejects(readStoredFile("listing-media", key), { code: "ENOENT" });
        assert.deepEqual(await readStoredFile("transaction-documents", "room/document.pdf"), bytes);
    } finally {
        process.chdir(previous);
        await rm(root, { recursive: true, force: true });
    }
});
