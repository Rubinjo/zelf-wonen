import { NextRequest, NextResponse } from "next/server";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    currentPrice,
    seekerListingInclude,
} from "@/features/seeker/seeker-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
    favoriteInputSchema,
    favoriteMigrationSchema,
} from "@/lib/schemas/seeker";

export async function GET() {
    try {
        const session = await requireEmailVerifiedUser();
        const favorites = await db.favoriteListing.findMany({
            where: { userId: session.user.id },
            select: { listingId: true, note: true },
            orderBy: { updatedAt: "desc" },
        });
        return NextResponse.json({ data: favorites });
    } catch (error) {
        return handleApiError(error, "FAVORITES_LOAD_FAILED");
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireEmailVerifiedUser();
        const body = await request.json();
        const migration = favoriteMigrationSchema.safeParse(body);
        const listingIds = migration.success
            ? [...new Set(migration.data.listingIds)]
            : [favoriteInputSchema.parse(body).listingId];
        const note = migration.success
            ? undefined
            : favoriteInputSchema.parse(body).note;
        const listings = await db.listing.findMany({
            where: {
                id: { in: listingIds },
                status: { in: ["LIVE", "UNDER_OFFER", "SOLD", "RENTED"] },
                publicSlug: { not: null },
            },
            include: seekerListingInclude,
        });
        await db.$transaction(
            listings.map((listing) =>
                db.favoriteListing.upsert({
                    where: {
                        userId_listingId: {
                            userId: session.user.id,
                            listingId: listing.id,
                        },
                    },
                    create: {
                        userId: session.user.id,
                        listingId: listing.id,
                        note,
                        priceSnapshotCents: currentPrice(listing),
                        statusSnapshot: listing.status,
                    },
                    update: note === undefined ? {} : { note },
                }),
            ),
        );
        return NextResponse.json(
            { data: { listingIds: listings.map((item) => item.id) } },
            { status: 201 },
        );
    } catch (error) {
        return handleApiError(error, "FAVORITE_SAVE_FAILED");
    }
}
