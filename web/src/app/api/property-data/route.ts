import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
    AuthenticationError,
    requireEmailVerifiedUser,
} from "@/features/auth/guards";
import { db } from "@/lib/db";
import { PdokClient } from "@/lib/integrations/property-data/pdok-client";
import {
    addressLookupSchema,
    propertyDataSchema,
} from "@/lib/schemas/property";

const pdok = new PdokClient();

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
                    orderBy: { registeredAt: "desc" },
                    take: 1,
                    select: {
                        registrationNumber: true,
                        labelClass: true,
                        primaryFossilEnergyKwhSqmYear: true,
                        registeredAt: true,
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
            cadastralParcelId: storedProperty?.cadastralParcelId ?? null,
            officialLandAreaSqm: storedProperty?.officialLandAreaSqm
                ? Number(storedProperty.officialLandAreaSqm)
                : null,
            energy:
                latestEnergy && labelClass
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
                      }
                    : null,
            sources: [
                { provider: "PDOK", retrievedAt: new Date().toISOString() },
                ...(storedProperty?.cadastralParcelId
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
