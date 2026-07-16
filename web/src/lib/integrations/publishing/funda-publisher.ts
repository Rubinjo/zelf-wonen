import type {
    ListingPublisher,
    PublicationPayload,
    PublicationResult,
} from "./publisher";

export class FundaPublisher implements ListingPublisher {
    constructor(
        private readonly baseUrl = process.env.FUNDA_API_BASE_URL,
        private readonly apiKey = process.env.FUNDA_API_KEY,
    ) {}

    async publish(
        payload: PublicationPayload,
        idempotencyKey: string,
    ): Promise<PublicationResult> {
        if (!this.baseUrl || !this.apiKey) {
            throw new Error("Simulated Funda publishing API is not configured");
        }

        const response = await fetch(`${this.baseUrl}/v1/consumer-listings`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${this.apiKey}`,
                "content-type": "application/json",
                "idempotency-key": idempotencyKey,
            },
            body: JSON.stringify(this.formatPayload(payload)),
            signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
            throw new Error(
                `Funda publishing failed with status ${response.status}`,
            );
        }

        const result = (await response.json()) as {
            id: string;
            status: "submitted" | "live";
        };

        return {
            externalReference: result.id,
            status: result.status === "live" ? "LIVE" : "SUBMITTED",
            submittedAt: new Date(),
        };
    }

    async withdraw(externalReference: string, reason: string): Promise<void> {
        if (!this.baseUrl || !this.apiKey) {
            throw new Error("Simulated Funda publishing API is not configured");
        }

        const response = await fetch(
            `${this.baseUrl}/v1/consumer-listings/${externalReference}`,
            {
                method: "DELETE",
                headers: {
                    authorization: `Bearer ${this.apiKey}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ reason }),
                signal: AbortSignal.timeout(15_000),
            },
        );

        if (!response.ok) {
            throw new Error(
                `Funda withdrawal failed with status ${response.status}`,
            );
        }
    }

    private formatPayload(payload: PublicationPayload) {
        return {
            sourceListingId: payload.listingId,
            product: payload.package.toLowerCase(),
            transactionType: payload.purpose.toLowerCase(),
            address: payload.address,
            price:
                payload.purpose === "SALE"
                    ? { amount: payload.askingPriceCents, interval: "once" }
                    : { amount: payload.monthlyRentCents, interval: "month" },
            characteristics: {
                livingAreaM2: payload.livingAreaSqm,
                rooms: payload.roomCount,
                energy: payload.energy,
            },
            copy: payload.description,
            media: {
                photos: payload.photos,
                floorPlans: payload.floorPlans,
            },
        };
    }
}
