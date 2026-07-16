export type PublicationPackage = "BRONZE" | "SILVER" | "GOLD";

export type PublicationAsset = {
    url: string;
    sha256: string;
    mimeType: string;
    sortOrder: number;
};

export type PublicationPayload = {
    listingId: string;
    package: PublicationPackage;
    purpose: "SALE" | "RENT";
    address: {
        postcode: string;
        houseNumber: number;
        addition: string | null;
        street: string;
        city: string;
    };
    askingPriceCents: string | null;
    monthlyRentCents: string | null;
    livingAreaSqm: number;
    roomCount: number;
    description: { nl: string; en: string | null };
    energy: {
        labelClass: string;
        primaryFossilEnergyKwhSqmYear: number | null;
        registrationNumber: string | null;
    } | null;
    photos: PublicationAsset[];
    floorPlans: PublicationAsset[];
};

export type PublicationResult = {
    externalReference: string;
    status: "SUBMITTED" | "LIVE";
    submittedAt: Date;
};

export interface ListingPublisher {
    publish(
        payload: PublicationPayload,
        idempotencyKey: string,
    ): Promise<PublicationResult>;
    withdraw(externalReference: string, reason: string): Promise<void>;
}
