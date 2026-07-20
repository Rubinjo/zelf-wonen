type BidDisclosureListing = {
    biddingMethod: "PRIVATE" | "SEALED" | "OPEN";
    bidWindowClosesAt: Date | null;
};

export function mayDiscloseBidsToSeller(
    listing: BidDisclosureListing,
    now = new Date(),
) {
    return (
        listing.biddingMethod === "OPEN" ||
        (listing.bidWindowClosesAt !== null && listing.bidWindowClosesAt <= now)
    );
}
