import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Building2, Clock3, Plus, ShieldCheck } from "lucide-react";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { listOwnerListings } from "@/features/listings/listing-service";

const statusLabel: Record<string, string> = {
    DRAFT: "Concept",
    READY_FOR_VERIFICATION: "Klaar voor iDIN",
    LIVE: "Live",
    UNDER_OFFER: "Onder bod",
    SOLD: "Verkocht",
    RENTED: "Verhuurd",
};

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
    _count?: { bids: number };
};

export default async function DashboardPage() {
    const session = await requireEmailVerifiedUser();
    const listings = (await listOwnerListings(
        session.user.id,
    )) as DashboardListing[];

    return (
        <>
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                        Eigenarenportaal
                    </p>
                    <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
                        Goedemorgen, {session.user.name.split(" ")[0]}
                    </h1>
                    <p className="mt-3 text-muted">
                        Beheer je advertenties, publicaties en biedingen op één
                        plek.
                    </p>
                </div>
                <Link
                    href="/dashboard/listings/new"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-semibold text-white hover:bg-brand-dark"
                >
                    <Plus size={18} /> Woning toevoegen
                </Link>
            </div>

            {listings.length === 0 ? (
                <section className="mt-12 grid min-h-96 place-items-center rounded-4xl border border-dashed border-brand/25 bg-white px-6 text-center">
                    <div className="max-w-md">
                        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-accent text-brand-dark">
                            <Building2 size={28} />
                        </span>
                        <h2 className="mt-6 text-2xl font-semibold">
                            Start met je eerste woning
                        </h2>
                        <p className="mt-3 leading-7 text-muted">
                            Zoek het adres op, controleer de officiële
                            woningdata en sla direct een veilig concept op.
                        </p>
                        <Link
                            href="/dashboard/listings/new"
                            className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-white"
                        >
                            Woning toevoegen <ArrowRight size={17} />
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
                                className="group overflow-hidden rounded-3xl border border-line bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                            >
                                <div className="relative h-48 bg-brand-dark/8">
                                    {photo ? (
                                        <Image
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
                                    <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow-sm">
                                        {statusLabel[listing.status] ??
                                            listing.status}
                                    </span>
                                </div>
                                <div className="p-6">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                                        {listing.purpose === "SALE"
                                            ? "Verkoop"
                                            : "Verhuur"}
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
                                            ).toLocaleDateString("nl-NL")}
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <ShieldCheck
                                                size={15}
                                                className="text-brand"
                                            />{" "}
                                            {listing._count?.bids ?? 0}{" "}
                                            biedingen
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
