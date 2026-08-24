import { BadgeCheck, Clock3, Home, KeyRound } from "lucide-react";
import type { MarketplaceStatus } from "@/features/listings/marketplace-service";

const styles: Record<MarketplaceStatus, string> = {
    LIVE: "bg-brand text-white",
    UNDER_OFFER: "bg-amber-500 text-white",
    SOLD: "bg-stone-800 text-white",
    RENTED: "bg-sky-700 text-white",
};

const icons = {
    LIVE: Home,
    UNDER_OFFER: Clock3,
    SOLD: BadgeCheck,
    RENTED: KeyRound,
} as const;

export function statusLabel(
    status: MarketplaceStatus,
    purpose?: "SALE" | "RENT",
) {
    switch (status) {
        case "LIVE":
            return purpose === "RENT" ? "Te huur" : "Te koop";
        case "UNDER_OFFER":
            return "Onder bod";
        case "SOLD":
            return "Verkocht";
        case "RENTED":
            return "Verhuurd";
    }
}

export function isBiddingClosed(listing: {
    status: MarketplaceStatus;
    bidWindowOpensAt: string | null;
    bidWindowClosesAt: string | null;
}) {
    if (listing.status !== "LIVE") return false;
    const now = Date.now();
    if (
        listing.bidWindowOpensAt &&
        new Date(listing.bidWindowOpensAt).getTime() > now
    )
        return false;
    return Boolean(
        listing.bidWindowClosesAt &&
        new Date(listing.bidWindowClosesAt).getTime() <= now,
    );
}

export function StatusBadge({
    status,
    purpose,
    biddingClosed = false,
    className,
}: {
    status: MarketplaceStatus;
    purpose?: "SALE" | "RENT";
    biddingClosed?: boolean;
    className?: string;
}) {
    if (status === "LIVE" && biddingClosed) {
        return (
            <span
                className={`inline-flex items-center gap-1.5 rounded-sm bg-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-700 shadow-sm dark:bg-white/10 dark:text-stone-200 ${className ?? ""}`}
            >
                <Clock3 size={13} />
                Bieding gesloten
            </span>
        );
    }
    const Icon = icons[status];
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold shadow-sm ${styles[status]} ${className ?? ""}`}
        >
            <Icon size={13} />
            {statusLabel(status, purpose)}
        </span>
    );
}
