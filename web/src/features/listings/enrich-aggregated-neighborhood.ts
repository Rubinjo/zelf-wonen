import { db } from "@/lib/db";
import { NeighborhoodDataClient } from "@/lib/integrations/neighborhood-data-client";
import { PdokClient } from "@/lib/integrations/property-data/pdok-client";
import type { NeighborhoodProfile } from "@/generated/prisma/client";

const pdok = new PdokClient();
const neighborhoodData = new NeighborhoodDataClient();
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const FACILITIES_RETRY_AFTER_MS = 60 * 60 * 1000;
const pendingLookups = new Map<string, Promise<NeighborhoodProfile | null>>();

export function loadAggregatedNeighborhood(id: string): Promise<NeighborhoodProfile | null> {
    const pending = pendingLookups.get(id);
    if (pending) return pending;
    const lookup = (async () => {
        try {
            await enrichAggregatedNeighborhood(id);
        } catch (error) {
            console.error("Imported neighborhood lookup failed", error);
        }
        return db.neighborhoodProfile.findUnique({ where: { aggregatedListingId: id } });
    })().finally(() => pendingLookups.delete(id));
    pendingLookups.set(id, lookup);
    return lookup;
}

export async function enrichAggregatedNeighborhood(id: string, force = false) {
    const listing = await db.aggregatedListing.findUnique({
        where: { id },
        include: { neighborhoodProfile: true },
    });
    if (!listing) return "missing";
    // A temporary Overpass outage must not hide transport data for 30 days.
    const refreshAfter = listing.houseNumber > 0 && listing.neighborhoodProfile?.osmRetrievedAt === null
        ? FACILITIES_RETRY_AFTER_MS : REFRESH_AFTER_MS;
    if (
        !force && listing.neighborhoodProfile &&
        Date.now() - listing.neighborhoodProfile.updatedAt.getTime() < refreshAfter
    ) {
        return "cached";
    }
    if (!listing.postcode) return "unavailable";
    const address = listing.houseNumber
        ? await pdok.lookupAddress({
            postcode: listing.postcode,
            houseNumber: listing.houseNumber,
            addition: listing.houseNumberAddition ?? undefined,
        })
        : null;
    const location = address?.neighborhoodCode && address.neighborhoodName && address.municipalityCode
        ? {
            neighborhoodCode: address.neighborhoodCode,
            neighborhoodName: address.neighborhoodName,
            districtCode: address.districtCode,
            districtName: address.districtName,
            municipalityCode: address.municipalityCode,
            // Kamernet's postalCodeLat/Long are postcode centroids. PDOK resolves
            // the actual address for distance, noise and foundation measurements.
            latitude: address.coordinates?.latitude ?? null,
            longitude: address.coordinates?.longitude ?? null,
        }
        : await pdok.lookupNeighborhoodByPostcode(listing.postcode);
    if (!location) return "unavailable";
    const profile = await neighborhoodData.lookup(location);
    if (!profile) return "unavailable";
    await db.$transaction([
        db.neighborhoodProfile.upsert({
            where: { aggregatedListingId: id },
            create: { aggregatedListingId: id, ...profile },
            update: profile,
        }),
        ...(address
            ? [db.aggregatedListing.update({
                where: { id },
                data: {
                    municipality: address.address.municipality,
                    province: address.address.province,
                    ...(address.coordinates ?? {}),
                },
            })]
            : []),
    ]);
    return "enriched";
}
