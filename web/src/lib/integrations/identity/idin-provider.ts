export type IdinStartRequest = {
    userId: string;
    listingId: string;
    returnUrl: string;
    locale: "nl" | "en";
};

export type IdinStartResult = {
    providerReference: string;
    redirectUrl: string;
    expiresAt: Date;
};

export type IdinCallbackResult = {
    providerReference: string;
    status: "VERIFIED" | "FAILED" | "EXPIRED" | "CANCELLED";
    subjectReference: string | null;
    attributesMatched: {
        legalName: boolean;
        is18OrOlder: boolean;
    };
    rawPayloadHash: string;
};

export interface IdinProvider {
    start(request: IdinStartRequest): Promise<IdinStartResult>;
    consumeCallback(request: Request): Promise<IdinCallbackResult>;
}

// Implement this interface with a certified iDIN service provider. Store a salted
// subject hash and match flags only; do not store BSN or raw bank assertions.
