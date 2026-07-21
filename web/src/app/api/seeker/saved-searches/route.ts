import { NextRequest, NextResponse } from "next/server";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { parseMarketplaceFilters } from "@/features/listings/marketplace-service";
import { handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { savedSearchInputSchema } from "@/lib/schemas/seeker";

const allowedKeys = new Set([
    "purpose",
    "q",
    "priceMin",
    "priceMax",
    "propertyType",
    "livingAreaMin",
    "roomsMin",
    "bedroomsMin",
    "constructionYearMin",
    "constructionYearMax",
    "isMonument",
    "energyLabel",
    "amenity",
    "parking",
    "north",
    "east",
    "south",
    "west",
    "sort",
]);

function canonicalSearch(raw: string) {
    const input = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
    const mapped: Record<string, string | string[]> = {};
    for (const key of new Set(input.keys()))
        if (allowedKeys.has(key)) {
            const values = input
                .getAll(key)
                .map((item) => item.trim())
                .filter(Boolean)
                .sort();
            if (values.length)
                mapped[key] = values.length === 1 ? values[0] : values;
        }
    parseMarketplaceFilters(mapped);
    const output = new URLSearchParams();
    for (const key of Object.keys(mapped).sort())
        for (const value of Array.isArray(mapped[key])
            ? mapped[key]
            : [mapped[key]])
            output.append(key, value);
    return output.toString();
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireEmailVerifiedUser();
        const input = savedSearchInputSchema.parse(await request.json());
        const queryString = canonicalSearch(input.queryString);
        const search = await db.savedSearch.upsert({
            where: {
                userId_queryString: { userId: session.user.id, queryString },
            },
            create: {
                userId: session.user.id,
                name: input.name,
                queryString,
                notificationsEnabled: input.notificationsEnabled,
            },
            update: {
                name: input.name,
                notificationsEnabled: input.notificationsEnabled,
            },
        });
        return NextResponse.json({ data: search }, { status: 201 });
    } catch (error) {
        return handleApiError(error, "SAVED_SEARCH_CREATE_FAILED");
    }
}
