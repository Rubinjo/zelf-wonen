import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    Building2,
    ChevronRight,
    Clock3,
    Heart,
    House,
    MapPin,
    ShieldCheck,
} from "lucide-react";
import { seekerListingInclude } from "@/features/seeker/seeker-service";
import { db } from "@/lib/db";

export const metadata: Metadata = {
    title: "Gedeelde woning-shortlist",
    robots: { index: false, follow: false },
};

export default async function PublicShortlistPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const token = (await params).token;
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) notFound();
    const share = await db.shortlistShare.findUnique({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") },
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
    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 border-b border-line bg-background/92 backdrop-blur-xl">
                <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-5">
                    <Link
                        href="/"
                        className="flex items-center gap-2.5 font-semibold"
                    >
                        <span className="grid size-9 place-items-center bg-brand text-white">
                            <Building2 size={19} />
                        </span>
                        <span className="text-lg">
                            Zelf<span className="text-brand">Wonen</span>
                        </span>
                    </Link>
                    <span className="inline-flex items-center gap-2 text-xs text-muted">
                        <ShieldCheck size={15} className="text-brand" />{" "}
                        Alleen-lezen shortlist
                    </span>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-5 py-10 lg:py-14">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                            Gedeeld met jou
                        </p>
                        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                            {share.label || "Woning-shortlist"}
                        </h1>
                        <p className="mt-3 max-w-xl text-muted">
                            Bekijk de geselecteerde woningen en de meegestuurde
                            notities. De actuele advertentie blijft leidend.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 border border-line bg-surface px-4 py-3 text-sm text-muted">
                        <Clock3 size={17} className="text-brand" /> Geldig tot{" "}
                        {share.expiresAt.toLocaleDateString("nl-NL")}
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
                                <Link href={`/woning/${listing.publicSlug}`}>
                                    <div className="relative aspect-4/3 bg-background">
                                        {listing.media[0] ? (
                                            <Image
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
                                            {listing.status === "LIVE"
                                                ? "Beschikbaar"
                                                : listing.status
                                                      .toLowerCase()
                                                      .replaceAll("_", " ")}
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
                                                {new Intl.NumberFormat(
                                                    "nl-NL",
                                                    {
                                                        style: "currency",
                                                        currency: "EUR",
                                                        maximumFractionDigits: 0,
                                                    },
                                                ).format(Number(price) / 100)}
                                                {listing.purpose === "RENT"
                                                    ? " / maand"
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
                                                kamers
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
                                            Bekijk woning{" "}
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
                                    Geen woningen meer beschikbaar
                                </h2>
                                <p className="mt-2 text-sm text-muted">
                                    De gedeelde woningen zijn verwijderd of niet
                                    langer openbaar.
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
