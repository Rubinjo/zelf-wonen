import { db } from "@/lib/db";
import { NeighborhoodDataClient } from "@/lib/integrations/neighborhood-data-client";
import { PdokClient } from "@/lib/integrations/property-data/pdok-client";

const pdok = new PdokClient();
const neighborhoodData = new NeighborhoodDataClient();

async function main() {
    const properties = await db.property.findMany({
        select: {
            id: true,
            postcode: true,
            houseNumber: true,
            houseNumberAddition: true,
            latitude: true,
            longitude: true,
        },
        orderBy: { createdAt: "asc" },
    });
    let enriched = 0;
    let unavailable = 0;
    let failed = 0;

    for (const property of properties) {
        try {
            const address = await pdok.lookupAddress({
                postcode: property.postcode,
                houseNumber: property.houseNumber,
                addition: property.houseNumberAddition ?? undefined,
            });
            if (
                !address?.neighborhoodCode ||
                !address.neighborhoodName ||
                !address.municipalityCode
            ) {
                unavailable += 1;
                continue;
            }
            const profile = await neighborhoodData.lookup({
                neighborhoodCode: address.neighborhoodCode,
                neighborhoodName: address.neighborhoodName,
                districtCode: address.districtCode,
                districtName: address.districtName,
                municipalityCode: address.municipalityCode,
                latitude:
                    property.latitude === null
                        ? (address.coordinates?.latitude ?? null)
                        : Number(property.latitude),
                longitude:
                    property.longitude === null
                        ? (address.coordinates?.longitude ?? null)
                        : Number(property.longitude),
            });
            if (!profile) {
                unavailable += 1;
                continue;
            }
            await db.neighborhoodProfile.upsert({
                where: { propertyId: property.id },
                create: { propertyId: property.id, ...profile },
                update: profile,
            });
            enriched += 1;
            console.info(
                `Enriched ${property.postcode} ${property.houseNumber}: ${profile.neighborhoodName}`,
            );
        } catch (error) {
            failed += 1;
            console.error(`Failed to enrich property ${property.id}`, error);
        }
    }

    console.info(
        `Neighborhood backfill complete: ${enriched} enriched, ${unavailable} unavailable, ${failed} failed.`,
    );
    if (failed > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error("Neighborhood backfill failed", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.$disconnect();
    });
