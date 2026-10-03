import Link from "next/link";
import { ListingImage } from "@/components/listing/listing-image";
import { ArrowRight, Building2, Clock3, Plus, ShieldCheck } from "lucide-react";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { listOwnerListings } from "@/features/listings/listing-service";
import { getLanguage } from "@/lib/language";

const statusLabel = {
    nl: {
        DRAFT: "Concept",
        READY_FOR_VERIFICATION: "Klaar voor verificatie",
        LIVE: "Live",
        UNDER_OFFER: "Onder bod",
        SOLD: "Verkocht",
        RENTED: "Verhuurd",
        ARCHIVED: "Gearchiveerd",
    },
    en: {
        DRAFT: "Draft",
        READY_FOR_VERIFICATION: "Ready for verification",
        LIVE: "Live",
        UNDER_OFFER: "Under offer",
        SOLD: "Sold",
        RENTED: "Rented",
        ARCHIVED: "Archived",
    },
} as const;

const purposeLabel = {
    nl: { SALE: "Verkoop", RENT: "Verhuur" },
    en: { SALE: "For sale", RENT: "For rent" },
} as const;

type DashboardMedia = { kind: string; status: string; storageKey: string };
type DashboardListing = {
    id: string;
    status: string;
    purpose: string;
    updatedAt: string;
    property: {
        street: string;
        houseNumber: number;
        houseNumberAddition: string | null;
        postcode: string;
        city: string;
    };
    media: DashboardMedia[];
};

export default async function DashboardPage() {
    const lang = await getLanguage();
    const session = await requireEmailVerifiedUser();
    const listings = (await listOwnerListings(
        session.user.id,
    )) as DashboardListing[];
    const t = statusLabel[lang];
    const p = purposeLabel[lang];

    const isEn = lang === "en";
    const portalTitle = isEn ? "Owner portal" : "Eigenarenportaal";
    const greeting = isEn ? "Good morning, " : "Goedemorgen, ";
    const subtitle = isEn
        ? "Manage your listings, publications and bids in one place."
        : "Beheer je advertenties, publicaties en biedingen op één plek.";
    const addListing = isEn ? "Add property" : "Woning toevoegen";
    const emptyTitle = isEn ? "Start with your first property" : "Start met je eerste woning";
    const emptyBody = isEn
        ? "Look up the address, verify the official property data and save a secure draft right away."
        : "Zoek het adres op, controleer de officiële woningdata en sla direct een veilig concept op.";
    const bidsLabel = isEn ? "Bids" : "Biedingen";

    return (
        <>
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                        {portalTitle}
                    </p>
                    <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
                        {greeting}
                        {session.user.name.split(" ")[0]}
                    </h1>
                    <p className="mt-3 text-muted">{subtitle}</p>
                </div>
                <Link
                    href="/dashboard/listings/new"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-semibold text-white hover:bg-brand-dark"
                >
                    <Plus size={18} /> {addListing}
                </Link>
            </div>

            {listings.length === 0 ? (
                <section className="mt-12 grid min-h-96 place-items-center rounded-4xl border border-dashed border-brand/25 bg-surface px-6 text-center">
                    <div className="max-w-md">
                        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-accent text-brand-dark">
                            <Building2 size={28} />
                        </span>
                        <h2 className="mt-6 text-2xl font-semibold">
                            {emptyTitle}
                        </h2>
                        <p className="mt-3 leading-7 text-muted">{emptyBody}</p>
                        <Link
                            href="/dashboard/listings/new"
                            className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-white"
                        >
                            {addListing} <ArrowRight size={17} />
                        </Link>
                    </div>
                </section>
            ) : (
                <section className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {listings.map((listing) => {
                        const photo = listing.media?.find(
                            (item) =>
                                item.kind === "PHOTO" &&
                                item.status === "READY",
                        );
                        return (
                            <Link
                                key={listing.id}
                                href={`/dashboard/listings/${listing.id}`}
                                className="group overflow-hidden rounded-3xl border border-line bg-surface shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                            >
                                <div className="relative h-48 bg-brand-dark/8">
                                    {photo ? (
                                        <ListingImage
                                            src={`/${photo.storageKey}`}
                                            alt=""
                                            width={800}
                                            height={480}
                                            className="size-full object-cover"
                                        />
                                    ) : (
                                        <div className="grid size-full place-items-center text-brand/35">
                                            <Building2 size={46} />
                                        </div>
                                    )}
                                    <span className="absolute left-4 top-4 rounded-full bg-background/95 px-3 py-1.5 text-xs font-semibold shadow-sm">
                                        {t[listing.status as keyof typeof t] ??
                                            listing.status}
                                    </span>
                                </div>
                                <div className="p-6">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                                        {p[listing.purpose as keyof typeof p] ??
                                            listing.purpose}
                                    </p>
                                    <h2 className="mt-2 text-xl font-semibold">
                                        {listing.property.street}{" "}
                                        {listing.property.houseNumber}
                                        {listing.property.houseNumberAddition ??
                                            ""}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted">
                                        {listing.property.postcode}{" "}
                                        {listing.property.city}
                                    </p>
                                    <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm text-muted">
                                        <span className="flex items-center gap-1.5">
                                            <Clock3 size={15} />{" "}
                                            {new Date(
                                                listing.updatedAt,
                                            ).toLocaleDateString(
                                                isEn ? "en-GB" : "nl-NL",
                                            )}
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <ShieldCheck
                                                size={15}
                                                className="text-brand"
                                            />{" "}
                                            {bidsLabel}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </section>
            )}
        </>
    );
}
