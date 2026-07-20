import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
    generateMovableItemsPdf,
    MovableItemsPdfError,
} from "@/features/listings/movable-items-pdf";
import { auth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    context: { params: Promise<{ listingId: string }> },
) {
    try {
        const listingId = z
            .string()
            .uuid()
            .parse((await context.params).listingId);
        const session = await auth.api.getSession({ headers: await headers() });
        const document = await generateMovableItemsPdf(
            listingId,
            session?.user.id ?? null,
        );
        return new NextResponse(Buffer.from(document.bytes), {
            headers: {
                "content-type": "application/pdf",
                "content-disposition": `attachment; filename="${document.fileName}"`,
                "cache-control": "private, no-store",
            },
        });
    } catch (error) {
        if (error instanceof MovableItemsPdfError) {
            return NextResponse.json(
                {
                    error: {
                        code: "MOVABLE_ITEMS_NOT_FOUND",
                        message: error.message,
                    },
                },
                { status: 404 },
            );
        }
        return handleApiError(error, "MOVABLE_ITEMS_PDF_FAILED");
    }
}
