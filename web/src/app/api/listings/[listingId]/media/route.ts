import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { deleteStoredFile, storeFile } from "@/lib/storage";

const allowedTypes = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
} as const;
const maxBytes = 20 * 1024 * 1024;

class MediaUploadConflict extends Error {}

function hasExpectedSignature(bytes: Buffer, mimeType: string) {
    if (mimeType === "image/jpeg")
        return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (mimeType === "image/png")
        return bytes
            .subarray(0, 8)
            .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            );
    if (mimeType === "image/webp")
        return (
            bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
            bytes.subarray(8, 12).toString("ascii") === "WEBP"
        );
    if (mimeType === "application/pdf")
        return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    return false;
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const listing = await db.listing.findFirst({
            where: {
                id: listingId,
                ownerId: session.user.id,
                status: { in: ["DRAFT", "READY_FOR_VERIFICATION"] },
            },
            select: { id: true },
        });
        if (!listing) {
            return NextResponse.json(
                {
                    error: {
                        code: "LISTING_NOT_FOUND",
                        message: "Editable listing not found",
                    },
                },
                { status: 404 },
            );
        }

        const form = await request.formData();
        const file = form.get("file");
        const requestedKind = form.get("kind");
        const documentLabel =
            form.get("documentRole") === "MOVABLE_ITEMS"
                ? "Lijst van zaken"
                : null;
        if (!(file instanceof File)) {
            return NextResponse.json(
                {
                    error: {
                        code: "FILE_REQUIRED",
                        message: "Select a file to upload",
                    },
                },
                { status: 400 },
            );
        }
        if (
            !(file.type in allowedTypes) ||
            file.size <= 0 ||
            file.size > maxBytes
        ) {
            return NextResponse.json(
                {
                    error: {
                        code: "UNSUPPORTED_FILE",
                        message: "Use a JPG, PNG, WebP or PDF file up to 20 MB",
                    },
                },
                { status: 415 },
            );
        }

        const kind =
            requestedKind === "FLOOR_PLAN_STATIC" ||
            requestedKind === "DOCUMENT"
                ? requestedKind
                : "PHOTO";
        if (kind === "PHOTO" && file.type === "application/pdf") {
            return NextResponse.json(
                {
                    error: {
                        code: "UNSUPPORTED_PHOTO",
                        message: "Photos must be JPG, PNG or WebP",
                    },
                },
                { status: 415 },
            );
        }
        if (kind === "DOCUMENT" && file.type !== "application/pdf") {
            return NextResponse.json(
                {
                    error: {
                        code: "UNSUPPORTED_DOCUMENT",
                        message: "Documents must be PDF files",
                    },
                },
                { status: 415 },
            );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        if (!hasExpectedSignature(bytes, file.type)) {
            return NextResponse.json(
                {
                    error: {
                        code: "INVALID_FILE_CONTENT",
                        message: "The file content does not match its type",
                    },
                },
                { status: 415 },
            );
        }
        const id = randomUUID();
        const extension = allowedTypes[file.type as keyof typeof allowedTypes];
        const relativeKey = `uploads/${listingId}/${id}${extension}`;
        await storeFile("listing-media", relativeKey, bytes);

        const media = await db
            .$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
                const current = await tx.listing.findFirst({
                    where: { id: listingId, ownerId: session.user.id },
                    select: {
                        status: true,
                        publications: {
                            where: {
                                status: {
                                    in: ["QUEUED", "SUBMITTED", "LIVE"],
                                },
                            },
                            take: 1,
                            select: { id: true },
                        },
                    },
                });
                if (
                    !current ||
                    !["DRAFT", "READY_FOR_VERIFICATION"].includes(
                        current.status,
                    ) ||
                    current.publications.length > 0
                ) {
                    throw new MediaUploadConflict(
                        "The listing is no longer editable",
                    );
                }
                const sortOrder = await tx.listingMedia.count({
                    where: { listingId, kind },
                });
                const created = await tx.listingMedia.create({
                    data: {
                        id,
                        listingId,
                        kind,
                        status: "READY",
                        storageKey: relativeKey,
                        mimeType: file.type,
                        sha256: createHash("sha256")
                            .update(bytes)
                            .digest("hex"),
                        fileName: file.name.slice(0, 255),
                        sizeBytes: BigInt(file.size),
                        processedAt: new Date(),
                        sortOrder,
                        altTextNl: documentLabel,
                    },
                });
                const updatedListing = await tx.listing.update({
                    where: { id: listingId },
                    data: {
                        status:
                            current.status === "READY_FOR_VERIFICATION"
                                ? "DRAFT"
                                : undefined,
                        validatedAt:
                            current.status === "READY_FOR_VERIFICATION"
                                ? null
                                : undefined,
                        version: { increment: 1 },
                    },
                });
                return {
                    media: created,
                    listingVersion: updatedListing.version,
                };
            })
            .catch(async (error) => {
                await deleteStoredFile("listing-media", relativeKey).catch(() => undefined);
                throw error;
            });

        return NextResponse.json(
            {
                data: {
                    ...media.media,
                    sizeBytes: media.media.sizeBytes.toString(),
                    listingVersion: media.listingVersion,
                    url: `/${relativeKey}`,
                },
            },
            { status: 201 },
        );
    } catch (error) {
        if (error instanceof MediaUploadConflict) {
            return NextResponse.json(
                {
                    error: {
                        code: "LISTING_LOCKED",
                        message: error.message,
                    },
                },
                { status: 409 },
            );
        }
        return handleApiError(error, "MEDIA_UPLOAD_FAILED");
    }
}
