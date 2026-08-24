import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    getOwnerMessagesView,
    getParticipantThread,
    ListingMessageError,
    sendListingMessage,
} from "@/features/messages/listing-messages-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { listingMessageInputSchema } from "@/lib/schemas/listing-message";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const session = await requireEmailVerifiedUser();
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const isOwner = await db.listing.findFirst({
            where: { id: listingId, ownerId: session.user.id },
            select: { id: true },
        });
        const data = isOwner
            ? await getOwnerMessagesView(listingId, session.user.id)
            : await getParticipantThread(listingId, session.user.id);
        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof ListingMessageError)
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status: 404 },
            );
        return handleApiError(error, "LISTING_MESSAGES_FAILED");
    }
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
        const input = listingMessageInputSchema.parse(await request.json());
        const message = await sendListingMessage({
            listingId,
            authorUserId: session.user.id,
            body: input.body,
            seekerUserId: input.seekerUserId,
        });
        return NextResponse.json({ data: message }, { status: 201 });
    } catch (error) {
        if (error instanceof ListingMessageError) {
            const status = error.code === "LISTING_NOT_FOUND" ? 404 : 409;
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                { status },
            );
        }
        return handleApiError(error, "MESSAGE_SEND_FAILED");
    }
}
