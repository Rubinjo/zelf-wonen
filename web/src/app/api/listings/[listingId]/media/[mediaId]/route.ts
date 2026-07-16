import { unlink } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";

class MediaDeleteConflict extends Error {}

export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ listingId: string; mediaId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const params = await context.params;
        const listingId = z.string().uuid().parse(params.listingId);
        const mediaId = z.string().uuid().parse(params.mediaId);
        const media = await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
            const listing = await tx.listing.findFirst({
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
                listing &&
                (!["DRAFT", "READY_FOR_VERIFICATION"].includes(
                    listing.status,
                ) ||
                    listing.publications.length > 0)
            ) {
                throw new MediaDeleteConflict(
                    "The listing is no longer editable",
                );
            }
            if (!listing) return null;
            const current = await tx.listingMedia.findFirst({
                where: { id: mediaId, listingId },
            });
            if (!current) return null;
            await tx.listingMedia.delete({ where: { id: current.id } });
            await tx.listing.update({
                where: { id: listingId },
                data: {
                    status:
                        listing.status === "READY_FOR_VERIFICATION"
                            ? "DRAFT"
                            : undefined,
                    validatedAt:
                        listing.status === "READY_FOR_VERIFICATION"
                            ? null
                            : undefined,
                    version: { increment: 1 },
                },
            });
            return current;
        });
        if (!media) {
            return NextResponse.json(
                {
                    error: {
                        code: "MEDIA_NOT_FOUND",
                        message: "Media item not found",
                    },
                },
                { status: 404 },
            );
        }
        if (media.storageKey.startsWith("uploads/")) {
            const target = path.resolve(
                process.cwd(),
                "public",
                media.storageKey,
            );
            const uploadsRoot = path.resolve(
                process.cwd(),
                "public",
                "uploads",
            );
            if (target.startsWith(`${uploadsRoot}${path.sep}`)) {
                await unlink(target).catch(() => undefined);
            }
        }
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        if (error instanceof MediaDeleteConflict) {
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
        return handleApiError(error, "MEDIA_DELETE_FAILED");
    }
}
