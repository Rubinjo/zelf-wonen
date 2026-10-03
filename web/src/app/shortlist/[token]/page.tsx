import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { ListingImage } from "@/components/listing/listing-image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    ChevronRight,
    Clock3,
    Heart,
    House,
    MapPin,
    ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "@/components/platform/brand-logo";
import { seekerListingInclude } from "@/features/seeker/seeker-service";
import { db } from "@/lib/db";
import { getLanguage } from "@/lib/language";

export async function generateMetadata(): Promise<Metadata> {
    const lang = await getLanguage();
    return {
        title:
            lang === "en"
                ? "Shared property shortlist"
                : "Gedeelde woning-shortlist",
        robots: { index: false, follow: false },
    };
}

function formatDate(date: Date, lang: "nl" | "en") {
    return date.toLocaleDateString(lang === "en" ? "en-GB" : "nl-NL");
}

function formatPrice(
    cents: bigint,
    purpose: "SALE" | "RENT",
    lang: "nl" | "en",
) {
    const value = new Intl.NumberFormat(lang === "en" ? "en-GB" : "nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Number(cents) / 100);
    return purpose === "RENT"
        ? `${value} / ${lang === "en" ? "month" : "maand"}`
        : value;
}

function statusLabel(status: string, lang: "nl" | "en"): string {
    const map: Record<string, Record<"nl" | "en", string>> = {
        LIVE: { nl: "Beschikbaar", en: "Available" },
        UNDER_OFFER: { nl: "Onder bod", en: "Under offer" },
        SOLD: { nl: "Verkocht", en: "Sold" },
        RENTED: { nl: "Verhuurd", en: "Rented" },
    };
    return map[status]?.[lang] ?? status.toLowerCase().replaceAll("_", " ");
}

export default async function PublicShortlistPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const lang = await getLanguage();
    const token = (await params).token;
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) notFound();
    const share = await db.shortlistShare.findUnique({
        where: {
            tokenHash: createHash("sha256").update(token).digest("hex"),
        },
        include: {
            items: {
                include: { listing: { include: seekerListingInclude } },
                orderBy: { sortOrder: "asc" },
            },
        },
    });
    if (!share || share.revokedAt || share.expiresAt <= new Date()) notFound();
    const items = share.items.filter(
        (item) =>
            item.listing.publicSlug &&
            ["LIVE", "UNDER_OFFER", "SOLD", "RENTED"].includes(
                item.listing.status,
            ),
    );
    const defaultTitle =
        lang === "en" ? "Property shortlist" : "Woning-shortlist";
    const label = share.label || defaultTitle;
    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 border-b border-line bg-background/92 backdrop-blur-xl">
                <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-5">
                    <Link href="/" className="flex items-center">
                        <BrandLogo className="h-9 w-auto" />
                    </Link>
                    <span className="inline-flex items-center gap-2 text-xs text-muted">
                        <ShieldCheck size={15} className="text-brand" />{" "}
                        {lang === "en"
                            ? "Read-only shortlist"
                            : "Alleen-lezen shortlist"}
                    </span>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-5 py-10 lg:py-14">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                            {lang === "en"
                                ? "Shared with you"
                                : "Gedeeld met jou"}
                        </p>
                        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                            {label}
                        </h1>
                        <p className="mt-3 max-w-xl text-muted">
                            {lang === "en"
                                ? "Browse the selected properties and the notes that came with them. The current listing remains leading."
                                : "Bekijk de geselecteerde woningen en de meegestuurde notities. De actuele advertentie blijft leidend."}
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 border border-line bg-surface px-4 py-3 text-sm text-muted">
                        <Clock3 size={17} className="text-brand" />{" "}
                        {lang === "en" ? "Valid until " : "Geldig tot "}
                        {formatDate(share.expiresAt, lang)}
                    </div>
                </div>
                <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => {
                        const listing = item.listing;
                        const price =
                            listing.purpose === "RENT"
                                ? listing.monthlyRentCents
                                : listing.askingPriceCents;
                        return (
                            <article
                                key={item.id}
                                className="overflow-hidden border border-line bg-surface"
                            >
                                <Link href={`/property/${listing.publicSlug}`}>
                                    <div className="relative aspect-4/3 bg-background">
                                        {listing.media[0] ? (
                                            <ListingImage
                                                src={`/${listing.media[0].storageKey}`}
                                                alt=""
                                                fill
                                                sizes="(max-width: 640px) 100vw, 380px"
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="dot-grid grid size-full place-items-center text-brand/30">
                                                <House size={48} />
                                            </div>
                                        )}
                                        <span className="absolute left-3 top-3 bg-white/95 px-2 py-1 text-xs font-semibold text-brand">
                                            {statusLabel(listing.status, lang)}
                                        </span>
                                    </div>
                                    <div className="p-5">
                                        <h2 className="text-lg font-semibold">
                                            {listing.property.street}{" "}
                                            {listing.property.houseNumber}
                                            {
                                                listing.property
                                                    .houseNumberAddition
                                            }
                                        </h2>
                                        <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted">
                                            <MapPin size={14} />{" "}
                                            {listing.property.postcode}{" "}
                                            {listing.property.city}
                                        </p>
                                        {price && (
                                            <p className="mt-4 text-xl font-semibold">
                                                {formatPrice(
                                                    price,
                                                    listing.purpose,
                                                    lang,
                                                )}
                                                {listing.purpose === "RENT"
                                                    ? ""
                                                    : lang === "en"
                                                      ? " (k.k.)"
                                                      : " k.k."}
                                            </p>
                                        )}
                                        <div className="mt-4 flex gap-4 border-t border-line pt-3 text-xs text-muted">
                                            <span>
                                                {listing.property.livingAreaSqm?.toString() ??
                                                    "—"}{" "}
                                                m²
                                            </span>
                                            <span>
                                                {listing.property.roomCount ??
                                                    "—"}{" "}
                                                {lang === "en"
                                                    ? "rooms"
                                                    : "kamers"}
                                            </span>
                                            <span className="ml-auto">
                                                {listing.property.energyLabels[0]?.labelClass?.replaceAll(
                                                    "_PLUS",
                                                    "+",
                                                ) ?? "Label —"}
                                            </span>
                                        </div>
                                        {item.note && (
                                            <p className="mt-4 border-l-2 border-brand pl-3 text-sm italic leading-6 text-muted">
                                                “{item.note}”
                                            </p>
                                        )}
                                        <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                                            {lang === "en"
                                                ? "View property"
                                                : "Bekijk woning"}{" "}
                                            <ChevronRight size={15} />
                                        </span>
                                    </div>
                                </Link>
                            </article>
                        );
                    })}
                    {!items.length && (
                        <div className="col-span-full grid min-h-72 place-items-center border border-dashed border-brand/25 bg-surface p-8 text-center">
                            <div>
                                <Heart
                                    className="mx-auto text-brand"
                                    size={32}
                                />
                                <h2 className="mt-4 text-xl font-semibold">
                                    {lang === "en"
                                        ? "No properties left"
                                        : "Geen woningen meer beschikbaar"}
                                </h2>
                                <p className="mt-2 text-sm text-muted">
                                    {lang === "en"
                                        ? "The shared properties were removed or are no longer public."
                                        : "De gedeelde woningen zijn verwijderd of niet langer openbaar."}
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
