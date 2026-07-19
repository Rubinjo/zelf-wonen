import { NextRequest, NextResponse } from "next/server";
import {
    searchMarketplaceListings,
    type MarketplaceSearchParams,
} from "@/features/listings/marketplace-service";
import { handleApiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
    try {
        const params: MarketplaceSearchParams = {};
        for (const [key, value] of request.nextUrl.searchParams) {
            const current = params[key];
            params[key] = current
                ? Array.isArray(current)
                    ? [...current, value]
                    : [current, value]
                : value;
        }
        const result = await searchMarketplaceListings(params);
        return NextResponse.json(result, {
            headers: {
                "Cache-Control":
                    "public, s-maxage=60, stale-while-revalidate=300",
            },
        });
    } catch (error) {
        return handleApiError(error, "MARKETPLACE_UNAVAILABLE");
    }
}
