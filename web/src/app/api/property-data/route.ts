import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
    AuthenticationError,
    requireEmailVerifiedUser,
} from "@/features/auth/guards";
import { db } from "@/lib/db";
import { BagWfsClient } from "@/lib/integrations/property-data/bag-wfs-client";
import { EnergielabelNlClient } from "@/lib/integrations/property-data/energielabel-nl-client";
import { KadasterWfsClient } from "@/lib/integrations/property-data/kadaster-wfs-client";
import { PdokClient } from "@/lib/integrations/property-data/pdok-client";
import {
    addressLookupSchema,
    propertyDataSchema,
} from "@/lib/schemas/property";

const pdok = new PdokClient();
const bag = new BagWfsClient();
const kadaster = new KadasterWfsClient();
const energielabelNl = new EnergielabelNlClient();

const energyLabelNames = {
    A_PLUS_PLUS_PLUS_PLUS_PLUS: "A+++++",
    A_PLUS_PLUS_PLUS_PLUS: "A++++",
    A_PLUS_PLUS_PLUS: "A+++",
    A_PLUS_PLUS: "A++",
    A_PLUS: "A+",
    A: "A",
    B: "B",
    C: "C",
    D: "D",
    E: "E",
    F: "F",
    G: "G",
    UNKNOWN: null,
} as const;

export async function GET(request: NextRequest) {
    try {
        await requireEmailVerifiedUser();
        const input = addressLookupSchema.parse({
            postcode: request.nextUrl.searchParams.get("postcode"),
            houseNumber: request.nextUrl.searchParams.get("houseNumber"),
            addition: request.nextUrl.searchParams.get("addition") || undefined,
        });

        const pdokAddress = await pdok.lookupAddress(input);
        if (!pdokAddress) {
            return NextResponse.json(
                {
                    error: {
                        code: "ADDRESS_NOT_FOUND",
                        message: "Address not found",
                    },
                },
                { status: 404 },
            );
        }

        const [bagData, cadastralData, liveEnergy] = await Promise.all([
            pdokAddress.bagObjectId
                ? bag.lookupObject(pdokAddress.bagObjectId).catch((error) => {
                      console.error("BAG enrichment failed", error);
                      return null;
                  })
                : null,
            pdokAddress.cadastralParcelIds.length === 1
                ? kadaster
                      .lookupParcel(pdokAddress.cadastralParcelIds[0])
                      .catch((error) => {
                          console.error("Kadaster enrichment failed", error);
                          return null;
                      })
                : null,
            energielabelNl.lookupAddress(input).catch((error) => {
                console.error("Energielabel.nl enrichment failed", error);
                return null;
            }),
        ]);

        // Kadaster/EP-Online sync workers normalize licensed/API data into these tables.
        const storedProperty = await db.property.findFirst({
            where: {
                postcode: input.postcode,
                houseNumber: input.houseNumber,
                houseNumberAddition: input.addition ?? null,
            },
            select: {
                cadastralParcelId: true,
                officialLandAreaSqm: true,
                energyLabels: {
                    where: { labelClass: { not: "UNKNOWN" } },
                    orderBy: { registeredAt: "desc" },
                    take: 1,
                    select: {
                        registrationNumber: true,
                        labelClass: true,
                        primaryFossilEnergyKwhSqmYear: true,
                        registeredAt: true,
                        validUntil: true,
                        retrievedAt: true,
                    },
                },
            },
        });
        const latestEnergy = storedProperty?.energyLabels[0];
        const labelClass = latestEnergy
            ? energyLabelNames[latestEnergy.labelClass]
            : null;

        const data = propertyDataSchema.parse({
            ...pdokAddress,
            bagBuildingId: bagData?.bagBuildingId ?? null,
            cadastralParcelId:
                storedProperty?.cadastralParcelId ??
                cadastralData?.cadastralParcelId ??
                null,
            suggestedPropertyType: bagData?.suggestedPropertyType ?? null,
            officialLandAreaSqm: storedProperty?.officialLandAreaSqm
                ? Number(storedProperty.officialLandAreaSqm)
                : (cadastralData?.officialLandAreaSqm ?? null),
            livingAreaSqm: bagData?.livingAreaSqm ?? null,
            roomCount: null,
            bedroomCount: null,
            constructionYear:
                bagData?.constructionYear ?? pdokAddress.constructionYear,
            energy: liveEnergy ??
                (latestEnergy && labelClass
                    ? {
                          registrationNumber: latestEnergy.registrationNumber,
                          labelClass,
                          primaryFossilEnergyKwhSqmYear:
                              latestEnergy.primaryFossilEnergyKwhSqmYear ===
                              null
                                  ? null
                                  : Number(
                                        latestEnergy.primaryFossilEnergyKwhSqmYear,
                                    ),
                          registeredAt:
                              latestEnergy.registeredAt?.toISOString() ?? null,
                          validUntil:
                              latestEnergy.validUntil?.toISOString() ?? null,
                      }
                                        : null),
            sources: [
                { provider: "PDOK", retrievedAt: new Date().toISOString() },
                ...(bagData
                    ? [
                          {
                              provider: "BAG" as const,
                              retrievedAt: new Date().toISOString(),
                          },
                      ]
                    : []),
                ...(storedProperty?.cadastralParcelId || cadastralData
                    ? [
                          {
                              provider: "KADASTER" as const,
                              retrievedAt: new Date().toISOString(),
                          },
                      ]
                    : []),
                ...(latestEnergy
                    ? [
                          {
                              provider: "RVO_EP_ONLINE" as const,
                              retrievedAt:
                                  latestEnergy.retrievedAt.toISOString(),
                          },
                      ]
                    : []),
                ...(liveEnergy
                    ? [
                          {
                              provider: "ENERGIELABEL_NL" as const,
                              retrievedAt: new Date().toISOString(),
                          },
                      ]
                    : []),
            ],
        });

        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof AuthenticationError) {
            return NextResponse.json(
                { error: { code: error.code, message: error.message } },
                {
                    status:
                        error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403,
                },
            );
        }
        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    error: {
                        code: "INVALID_ADDRESS",
                        message: "Check the postcode and house number",
                        fieldErrors: error.flatten().fieldErrors,
                    },
                },
                { status: 400 },
            );
        }
        console.error("Property data lookup failed", error);
        return NextResponse.json(
            {
                error: {
                    code: "PROPERTY_DATA_UNAVAILABLE",
                    message: "Property data is temporarily unavailable",
                },
            },
            { status: 503 },
        );
    }
}
