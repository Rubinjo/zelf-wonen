"use client";

import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import {
    BadgeEuro,
    Bot,
    Building2,
    CalendarDays,
    Check,
    ChevronRight,
    CircleAlert,
    ExternalLink,
    FileImage,
    FileText,
    FileUp,
    Fingerprint,
    ImagePlus,
    LoaderCircle,
    Plus,
    Save,
    Send,
    ShieldCheck,
    Sparkles,
    Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
    parkingOptions,
    propertyAmenityOptions,
    roofTypeOptions,
    type ParkingOption,
    type PropertyAmenity,
    type RoofType,
} from "@/lib/property-options";
import { ViewingPlanner } from "@/components/listing/viewing-planner";

type MediaItem = {
    id: string;
    kind: "PHOTO" | "FLOOR_PLAN_STATIC" | "DOCUMENT";
    status: string;
    storageKey: string;
    mimeType: string;
    sha256: string;
    fileName: string;
    altTextNl: string | null;
};

type UploadedMedia = MediaItem & { listingVersion: number };

type MovableItemCategory = "STAYS" | "GOES" | "FOR_TAKEOVER";
type MovableItem = {
    id: string;
    name: string;
    category: MovableItemCategory;
    notes: string;
};

export type ListingView = {
    id: string;
    purpose: "SALE" | "RENT";
    status: string;
    version: number;
    publicSlug: string | null;
    titleNl: string | null;
    titleEn: string | null;
    descriptionNl: string | null;
    descriptionEn: string | null;
    askingPriceCents: string | null;
    monthlyRentCents: string | null;
    serviceCostsCents: string | null;
    viewingNotes: string | null;
    biddingMethod: "PRIVATE" | "SEALED" | "OPEN";
    minimumBidCents: string | null;
    bidIncrementCents: string | null;
    allowBidConditions: boolean;
    bidWindowOpensAt: string | null;
    bidWindowClosesAt: string | null;
    attributes: {
        condition?: "POOR" | "FAIR" | "GOOD" | "EXCELLENT";
        outdoorSpace?: boolean;
        parking?: boolean;
        furnished?: boolean;
        petsAllowed?: boolean;
        depositCents?: string;
        rentalDurationMonths?: number;
        highlights?: string[];
        movableItems?: MovableItem[];
    } | null;
    property: {
        postcode: string;
        houseNumber: number;
        houseNumberAddition: string | null;
        street: string;
        city: string;
        propertyType:
            | "HOUSE"
            | "APARTMENT"
            | "PARKING"
            | "LAND"
            | "COMMERCIAL"
            | "OTHER";
        livingAreaSqm: number | null;
        officialLandAreaSqm: number | null;
        roomCount: number | null;
        bedroomCount: number | null;
        bathroomCount: number | null;
        floorCount: number | null;
        roofType: RoofType | null;
        externalStorageAreaSqm: number | null;
        amenities: PropertyAmenity[];
        parkingOptions: ParkingOption[];
        parkingSpacePriceCents: string | null;
        constructionYear: number | null;
        isMonument: boolean;
        energyLabels: Array<{
            labelClass: string;
            primaryFossilEnergyKwhSqmYear: number | null;
        }>;
    };
    media: MediaItem[];
    floorPlans: Array<{ embedUrl: string | null }>;
    identityAttempts: Array<{ status: string }>;
    publicationOrders: Array<{ id: string; package: string; status: string }>;
    publications: Array<{
        id: string;
        channel: string;
        status: string;
        externalReference: string | null;
    }>;
    _count: { bids: number };
};

type Section =
    | "details"
    | "media"
    | "movableItems"
    | "estimate"
    | "viewings"
    | "publish"
    | "bids";
type ApiError = { error?: { message?: string } };
type EditorState = {
    titleNl: string;
    titleEn: string;
    descriptionNl: string;
    descriptionEn: string;
    livingAreaSqm: string;
    officialLandAreaSqm: string;
    roomCount: string;
    bedroomCount: string;
    bathroomCount: string;
    floorCount: string;
    roofType: RoofType | "";
    externalStorageAreaSqm: string;
    amenities: PropertyAmenity[];
    parkingOptions: ParkingOption[];
    parkingSpacePrice: string;
    constructionYear: string;
    isMonument: boolean;
    askingPrice: string;
    monthlyRent: string;
    serviceCosts: string;
    biddingMethod: "PRIVATE" | "SEALED" | "OPEN";
    minimumBid: string;
    bidIncrement: string;
    allowBidConditions: boolean;
    viewingNotes: string;
    floorplannerEmbedUrl: string;
    bidWindowOpensAt: string;
    bidWindowClosesAt: string;
    movableItems: MovableItem[];
};

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as {
        data?: T;
    } & ApiError;
    if (!response.ok)
        throw new Error(payload.error?.message ?? "De aanvraag is mislukt");
    return payload.data as T;
}

function euros(cents: string | null) {
    return cents ? String(Number(cents) / 100) : "";
}

function toCents(value: string) {
    if (!value.trim()) return null;
    return String(Math.round(Number(value.replace(",", ".")) * 100));
}

const sections: Array<{ id: Section; label: string; icon: typeof Building2 }> =
    [
        { id: "details", label: "Gegevens & tekst", icon: Building2 },
        { id: "media", label: "Foto's & plattegrond", icon: FileImage },
        { id: "movableItems", label: "Lijst van zaken", icon: FileText },
        { id: "estimate", label: "Prijs & bieden", icon: BadgeEuro },
        { id: "viewings", label: "Bezichtigingen", icon: CalendarDays },
        { id: "publish", label: "Controleren & publiceren", icon: Send },
        { id: "bids", label: "Biedlogboek", icon: ShieldCheck },
    ];

export function ListingEditor({
    initialListing,
}: {
    initialListing: ListingView;
}) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [listing, setListing] = useState(initialListing);
    const [section, setSection] = useState<Section>("details");
    const [notice, setNotice] = useState("");
    const [editor, setEditor] = useState<EditorState>({
        titleNl: listing.titleNl ?? "",
        titleEn: listing.titleEn ?? "",
        descriptionNl: listing.descriptionNl ?? "",
        descriptionEn: listing.descriptionEn ?? "",
        livingAreaSqm: listing.property.livingAreaSqm?.toString() ?? "",
        officialLandAreaSqm:
            listing.property.officialLandAreaSqm?.toString() ?? "",
        roomCount: listing.property.roomCount?.toString() ?? "",
        bedroomCount: listing.property.bedroomCount?.toString() ?? "",
        bathroomCount: listing.property.bathroomCount?.toString() ?? "",
        floorCount: listing.property.floorCount?.toString() ?? "",
        roofType: listing.property.roofType ?? "",
        externalStorageAreaSqm:
            listing.property.externalStorageAreaSqm?.toString() ?? "",
        amenities: listing.property.amenities,
        parkingOptions: listing.property.parkingOptions,
        parkingSpacePrice: euros(listing.property.parkingSpacePriceCents),
        constructionYear: listing.property.constructionYear?.toString() ?? "",
        isMonument: listing.property.isMonument,
        askingPrice: euros(listing.askingPriceCents),
        monthlyRent: euros(listing.monthlyRentCents),
        serviceCosts: euros(listing.serviceCostsCents),
        biddingMethod: listing.biddingMethod,
        minimumBid: euros(listing.minimumBidCents),
        bidIncrement: euros(listing.bidIncrementCents),
        allowBidConditions: listing.allowBidConditions ?? true,
        viewingNotes: listing.viewingNotes ?? "",
        floorplannerEmbedUrl: listing.floorPlans[0]?.embedUrl ?? "",
        bidWindowOpensAt: listing.bidWindowOpensAt?.slice(0, 16) ?? "",
        bidWindowClosesAt: listing.bidWindowClosesAt?.slice(0, 16) ?? "",
        movableItems: listing.attributes?.movableItems ?? [],
    });

    const editable = ["DRAFT", "READY_FOR_VERIFICATION"].includes(
        listing.status,
    );
    const verified = listing.identityAttempts.some(
        (attempt) => attempt.status === "VERIFIED",
    );
    const paidOrder = listing.publicationOrders.find(
        (order) => order.status === "PAID",
    );

    const save = useMutation({
        mutationFn: () =>
            requestData<ListingView>(`/api/listings/${listing.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    version: listing.version,
                    livingAreaSqm: Number(editor.livingAreaSqm) || null,
                    officialLandAreaSqm: editor.officialLandAreaSqm
                        ? Number(editor.officialLandAreaSqm)
                        : null,
                    roomCount: Number(editor.roomCount) || null,
                    bedroomCount: editor.bedroomCount
                        ? Number(editor.bedroomCount)
                        : null,
                    bathroomCount: editor.bathroomCount
                        ? Number(editor.bathroomCount)
                        : null,
                    floorCount: editor.floorCount
                        ? Number(editor.floorCount)
                        : null,
                    roofType: editor.roofType || null,
                    externalStorageAreaSqm: editor.externalStorageAreaSqm
                        ? Number(editor.externalStorageAreaSqm)
                        : null,
                    amenities: editor.amenities,
                    parkingOptions: editor.parkingOptions,
                    parkingSpacePriceCents: editor.parkingOptions.includes(
                        "SPACE_FOR_SALE",
                    )
                        ? toCents(editor.parkingSpacePrice)
                        : null,
                    constructionYear: editor.constructionYear
                        ? Number(editor.constructionYear)
                        : null,
                    isMonument: editor.isMonument,
                    titleNl: editor.titleNl || null,
                    titleEn: editor.titleEn || null,
                    descriptionNl: editor.descriptionNl || null,
                    descriptionEn: editor.descriptionEn || null,
                    askingPriceCents: toCents(editor.askingPrice),
                    monthlyRentCents: toCents(editor.monthlyRent),
                    serviceCostsCents: toCents(editor.serviceCosts),
                    biddingMethod: editor.biddingMethod,
                    minimumBidCents: toCents(editor.minimumBid),
                    bidIncrementCents:
                        editor.biddingMethod === "OPEN"
                            ? toCents(editor.bidIncrement)
                            : null,
                    allowBidConditions: editor.allowBidConditions,
                    viewingNotes: editor.viewingNotes || null,
                    floorplannerEmbedUrl: editor.floorplannerEmbedUrl || null,
                    bidWindowOpensAt: editor.bidWindowOpensAt
                        ? new Date(editor.bidWindowOpensAt).toISOString()
                        : null,
                    bidWindowClosesAt: editor.bidWindowClosesAt
                        ? new Date(editor.bidWindowClosesAt).toISOString()
                        : null,
                    attributes: {
                        ...listing.attributes,
                        movableItems: editor.movableItems.filter((item) =>
                            item.name.trim(),
                        ),
                    },
                }),
            }),
        onSuccess(data) {
            setListing(data);
            setNotice("Concept opgeslagen");
            router.refresh();
        },
    });

    const aiWriter = useMutation({
        mutationFn: () =>
            requestData<{ text: string }>("/api/ai/listing-description", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    locale: "nl",
                    purpose: listing.purpose,
                    propertyType: listing.property.propertyType,
                    city: listing.property.city,
                    livingAreaSqm: Number(editor.livingAreaSqm),
                    roomCount: Number(editor.roomCount),
                    highlights: [],
                    existingText: editor.descriptionNl || undefined,
                }),
            }),
        onSuccess(data) {
            setEditor((current) => ({ ...current, descriptionNl: data.text }));
            setNotice("AI-voorstel gemaakt — controleer de tekst en sla op");
        },
    });

    const estimate = useMutation({
        mutationFn: () => {
            const images = listing.media
                .filter(
                    (item) =>
                        item.kind === "PHOTO" &&
                        item.status === "READY" &&
                        item.mimeType !== "application/pdf",
                )
                .map((item) => ({
                    storageKey: item.storageKey,
                    sha256: item.sha256,
                    mimeType: item.mimeType,
                }));
            return requestData<{
                estimatedValueCents: string;
                lowerBoundCents: string;
                upperBoundCents: string;
                confidence: number;
                tier: string;
                cached: boolean;
            }>("/api/estimates", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    postcode: listing.property.postcode,
                    houseNumber: listing.property.houseNumber,
                    propertyType: listing.property.propertyType,
                    livingAreaSqm: Number(editor.livingAreaSqm),
                    roomCount: Number(editor.roomCount),
                    constructionYear: editor.constructionYear
                        ? Number(editor.constructionYear)
                        : undefined,
                    userText: editor.descriptionNl,
                    images,
                }),
            });
        },
    });

    const validate = useMutation({
        mutationFn: () =>
            requestData<{
                ready: boolean;
                issues: Array<{ field: string; message: string }>;
                listing: ListingView;
            }>(`/api/listings/${listing.id}/validate`, { method: "POST" }),
        onSuccess(data) {
            if (data.ready) {
                setListing(data.listing);
                setNotice("Advertentie is compleet en klaar voor iDIN");
            }
        },
    });

    const startIdin = useMutation({
        mutationFn: () =>
            requestData<{
                alreadyVerified: boolean;
                redirectUrl: string | null;
            }>(`/api/listings/${listing.id}/idin/start`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ locale: "nl" }),
            }),
        onSuccess(data) {
            if (data.alreadyVerified) {
                setNotice("iDIN is al voltooid");
                router.refresh();
            } else if (data.redirectUrl) {
                window.location.assign(data.redirectUrl);
            }
        },
    });

    const checkout = useMutation({
        mutationFn: (packageName: "BRONZE" | "SILVER" | "GOLD") =>
            requestData<{ simulated: boolean; checkoutUrl: string | null }>(
                `/api/listings/${listing.id}/publication-orders`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        package: packageName,
                        idempotencyKey: crypto.randomUUID(),
                    }),
                },
            ),
        onSuccess(data) {
            if (data.checkoutUrl) window.location.assign(data.checkoutUrl);
            else {
                setNotice(
                    data.simulated
                        ? "Testbetaling geslaagd"
                        : "Betaling gestart",
                );
                router.refresh();
                window.location.reload();
            }
        },
    });

    const publish = useMutation({
        mutationFn: (packageName: "BRONZE" | "SILVER" | "GOLD") =>
            requestData<{
                publications: Array<{ channel: string; status: string }>;
            }>(`/api/listings/${listing.id}/publish`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    package: packageName,
                    channels: ["PLATFORM", "FUNDA"],
                    idempotencyKey: crypto.randomUUID(),
                }),
            }),
        onSuccess() {
            setNotice("Publicatie is gestart");
            router.refresh();
            window.location.reload();
        },
    });

    const bids = useQuery({
        queryKey: ["listing-bids", listing.id],
        queryFn: () =>
            requestData<Array<BidView>>(`/api/listings/${listing.id}/bids`),
        enabled: section === "bids" && listing.status !== "DRAFT",
    });

    const address = `${listing.property.street} ${listing.property.houseNumber}${listing.property.houseNumberAddition ?? ""}`;

    return (
        <div>
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-brand">
                        <span>
                            {listing.purpose === "SALE" ? "Verkoop" : "Verhuur"}
                        </span>
                        <ChevronRight size={14} />
                        <span>{statusText(listing.status)}</span>
                    </div>
                    <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                        {address}
                    </h1>
                    <p className="mt-2 text-muted">
                        {listing.property.postcode} {listing.property.city}
                    </p>
                </div>
                {editable ? (
                    <button
                        onClick={() => save.mutate()}
                        disabled={save.isPending}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-semibold text-white disabled:opacity-60"
                    >
                        {save.isPending ? (
                            <LoaderCircle className="animate-spin" size={17} />
                        ) : (
                            <Save size={17} />
                        )}{" "}
                        Concept opslaan
                    </button>
                ) : listing.publicSlug ? (
                    <a
                        href={`/woning/${listing.publicSlug}`}
                        target="_blank"
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-semibold text-white"
                    >
                        Bekijk advertentie <ChevronRight size={17} />
                    </a>
                ) : null}
            </div>

            {notice || save.error ? (
                <div
                    className={`mt-6 rounded-2xl px-5 py-4 text-sm ${save.error ? "bg-red-50 text-red-700" : "bg-brand/8 text-brand-dark"}`}
                >
                    {save.error?.message ?? notice}
                </div>
            ) : null}

            <div className="mt-8 grid gap-7 lg:grid-cols-[250px_1fr]">
                <aside className="h-fit rounded-3xl border border-line bg-white p-2 lg:sticky lg:top-24">
                    {sections.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    setSection(item.id);
                                    if (
                                        item.id === "publish" &&
                                        listing.status === "DRAFT" &&
                                        !validate.isPending
                                    ) {
                                        validate.mutate();
                                    }
                                }}
                                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${section === item.id ? "bg-brand text-white" : "hover:bg-background"}`}
                            >
                                <Icon size={18} /> {item.label}
                            </button>
                        );
                    })}
                </aside>

                <section className="min-w-0 rounded-4xl border border-line bg-white p-6 shadow-sm sm:p-9">
                    {section === "details" ? (
                        <DetailsSection
                            listing={listing}
                            setListing={setListing}
                            editor={editor}
                            setEditor={setEditor}
                            editable={editable}
                            aiWriter={aiWriter}
                        />
                    ) : null}
                    {section === "media" ? (
                        <MediaSection
                            listing={listing}
                            setListing={setListing}
                            editable={editable}
                            editor={editor}
                            setEditor={setEditor}
                        />
                    ) : null}
                    {section === "movableItems" ? (
                        <MovableItemsSection
                            listing={listing}
                            setListing={setListing}
                            items={editor.movableItems}
                            setItems={(movableItems) =>
                                setEditor((current) => ({
                                    ...current,
                                    movableItems,
                                }))
                            }
                            editable={editable}
                        />
                    ) : null}
                    {section === "estimate" ? (
                        <PriceAndBiddingSection
                            listing={listing}
                            editor={editor}
                            setEditor={setEditor}
                            editable={editable}
                            estimate={estimate}
                        />
                    ) : null}
                    {section === "viewings" ? (
                        <ViewingPlanner
                            listingId={listing.id}
                            propertyType={listing.property.propertyType}
                            listingStatus={listing.status}
                        />
                    ) : null}
                    {section === "publish" ? (
                        <PublishSection
                            listing={listing}
                            verified={verified}
                            paidOrder={paidOrder}
                            validate={validate}
                            startIdin={startIdin}
                            checkout={checkout}
                            publish={publish}
                        />
                    ) : null}
                    {section === "bids" ? (
                        <BidsSection
                            listing={listing}
                            bids={bids.data ?? []}
                            loading={bids.isLoading}
                            onDecision={() =>
                                queryClient.invalidateQueries({
                                    queryKey: ["listing-bids", listing.id],
                                })
                            }
                        />
                    ) : null}
                </section>
            </div>
        </div>
    );
}

function DetailsSection({
    listing,
    setListing,
    editor,
    setEditor,
    editable,
    aiWriter,
}: {
    listing: ListingView;
    setListing: React.Dispatch<React.SetStateAction<ListingView>>;
    editor: EditorState;
    setEditor: React.Dispatch<React.SetStateAction<EditorState>>;
    editable: boolean;
    aiWriter: { mutate: () => void; isPending: boolean; error: Error | null };
}) {
    const set =
        (key: string) =>
        (
            event: ChangeEvent<
                HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >,
        ) =>
            setEditor((current) => ({ ...current, [key]: event.target.value }));
    const toggleOption = (
        key: "amenities" | "parkingOptions",
        value: PropertyAmenity | ParkingOption,
    ) =>
        setEditor((current) => {
            const values: string[] = current[key];
            return {
                ...current,
                [key]: values.includes(value)
                    ? values.filter((item) => item !== value)
                    : [...values, value],
            };
        });
    return (
        <div>
            <SectionHeading
                icon={Building2}
                title="Woninggegevens"
                text="Vul de feiten zorgvuldig in. Deze gegevens worden gebruikt voor validatie, waardeschatting en publicatie."
            />
            <fieldset
                disabled={!editable}
                className="mt-8 grid gap-5 sm:grid-cols-2 disabled:opacity-70"
            >
                <Input
                    label="Woonoppervlak (m²)"
                    type="number"
                    value={editor.livingAreaSqm}
                    onChange={set("livingAreaSqm")}
                />
                <Input
                    label="Perceeloppervlak (m²)"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editor.officialLandAreaSqm}
                    onChange={set("officialLandAreaSqm")}
                />
                <Input
                    label="Externe bergruimte (m²)"
                    type="number"
                    min="0"
                    max="10000"
                    step="0.1"
                    value={editor.externalStorageAreaSqm}
                    onChange={set("externalStorageAreaSqm")}
                />
                <Input
                    label="Aantal kamers"
                    type="number"
                    value={editor.roomCount}
                    onChange={set("roomCount")}
                />
                <Input
                    label="Aantal slaapkamers"
                    type="number"
                    value={editor.bedroomCount}
                    onChange={set("bedroomCount")}
                />
                <Input
                    label="Aantal badkamers"
                    type="number"
                    min="0"
                    max="100"
                    value={editor.bathroomCount}
                    onChange={set("bathroomCount")}
                />
                <Input
                    label="Bouwjaar"
                    type="number"
                    value={editor.constructionYear}
                    onChange={set("constructionYear")}
                />
                <label className="flex items-center gap-3 self-end rounded-md border border-line px-4 py-3 text-sm font-semibold">
                    <input
                        type="checkbox"
                        checked={editor.isMonument}
                        onChange={(event) =>
                            setEditor((current) => ({
                                ...current,
                                isMonument: event.target.checked,
                            }))
                        }
                        className="size-4 accent-brand"
                    />
                    Monumentaal pand
                </label>
                <Input
                    label="Aantal woonlagen"
                    type="number"
                    min="1"
                    max="100"
                    value={editor.floorCount}
                    onChange={set("floorCount")}
                />
                <label className="block text-sm font-semibold">
                    Daktype
                    <select
                        value={editor.roofType}
                        onChange={set("roofType")}
                        className="input mt-2"
                    >
                        <option value="">Niet opgegeven</option>
                        {roofTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="sm:col-span-2">
                    <OptionCheckboxes
                        title="Voorzieningen"
                        options={propertyAmenityOptions}
                        values={editor.amenities}
                        onToggle={(value) => toggleOption("amenities", value)}
                    />
                </div>
                <div className="sm:col-span-2">
                    <OptionCheckboxes
                        title="Parkeren"
                        options={parkingOptions}
                        values={editor.parkingOptions}
                        onToggle={(value) =>
                            toggleOption("parkingOptions", value)
                        }
                    />
                </div>
                {editor.parkingOptions.includes("SPACE_FOR_SALE") ? (
                    <Input
                        label="Prijs parkeerplaats apart te koop (€)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editor.parkingSpacePrice}
                        onChange={set("parkingSpacePrice")}
                    />
                ) : null}
            </fieldset>
            <EnergyLabelPanel
                listing={listing}
                setListing={setListing}
                editable={editable}
            />
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
                <div>
                    <h3 className="text-xl font-semibold">Advertentietekst</h3>
                    <p className="mt-1 text-sm text-muted">
                        Schrijf zelf of gebruik een feitelijk AI-voorstel.
                    </p>
                </div>
                <button
                    type="button"
                    disabled={
                        !editable ||
                        aiWriter.isPending ||
                        !editor.livingAreaSqm ||
                        !editor.roomCount
                    }
                    onClick={() => aiWriter.mutate()}
                    className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-brand-dark disabled:opacity-50"
                >
                    {aiWriter.isPending ? (
                        <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                        <Bot size={17} />
                    )}{" "}
                    Schrijf met AI
                </button>
            </div>
            {aiWriter.error ? (
                <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    {aiWriter.error.message}
                </p>
            ) : null}
            <fieldset
                disabled={!editable}
                className="mt-6 space-y-5 disabled:opacity-70"
            >
                <Input
                    label="Nederlandse titel"
                    value={editor.titleNl}
                    onChange={set("titleNl")}
                />
                <TextArea
                    label="Nederlandse omschrijving"
                    value={editor.descriptionNl}
                    onChange={set("descriptionNl")}
                    rows={8}
                />
                <Input
                    label="English title (optional)"
                    value={editor.titleEn}
                    onChange={set("titleEn")}
                />
                <TextArea
                    label="English description (optional)"
                    value={editor.descriptionEn}
                    onChange={set("descriptionEn")}
                    rows={6}
                />
                <TextArea
                    label="Notities voor bezichtigingen"
                    value={editor.viewingNotes}
                    onChange={set("viewingNotes")}
                    rows={3}
                />
            </fieldset>
        </div>
    );
}

function OptionCheckboxes<Option extends string>({
    title,
    options,
    values,
    onToggle,
}: {
    title: string;
    options: ReadonlyArray<{ value: Option; label: string }>;
    values: Option[];
    onToggle: (value: Option) => void;
}) {
    return (
        <fieldset className="border-t border-line pt-6">
            <legend className="font-semibold">{title}</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {options.map((option) => (
                    <label
                        key={option.value}
                        className="flex min-h-11 cursor-pointer items-center gap-3 border border-line px-4 py-2.5 text-sm font-normal"
                    >
                        <input
                            type="checkbox"
                            checked={values.includes(option.value)}
                            onChange={() => onToggle(option.value)}
                            className="size-4 accent-brand"
                        />
                        {option.label}
                    </label>
                ))}
            </div>
        </fieldset>
    );
}

const energyLabelNames: Record<string, string> = {
    A_PLUS_PLUS_PLUS_PLUS_PLUS: "A+++++",
    A_PLUS_PLUS_PLUS_PLUS: "A++++",
    A_PLUS_PLUS_PLUS: "A+++",
    A_PLUS_PLUS: "A++",
    A_PLUS: "A+",
};

function EnergyLabelPanel({
    listing,
    setListing,
    editable,
}: {
    listing: ListingView;
    setListing: React.Dispatch<React.SetStateAction<ListingView>>;
    editable: boolean;
}) {
    const energy = listing.property.energyLabels[0];
    const documents = listing.media.filter(
        (item) =>
            item.kind === "DOCUMENT" && item.altTextNl !== "Lijst van zaken",
    );
    const upload = useMutation({
        mutationFn: async (file: File) => {
            const form = new FormData();
            form.set("file", file);
            form.set("kind", "DOCUMENT");
            const response = await fetch(`/api/listings/${listing.id}/media`, {
                method: "POST",
                body: form,
            });
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error?.message ?? "Upload mislukt");
            return payload.data as UploadedMedia;
        },
        onSuccess(uploaded) {
            const { listingVersion, ...media } = uploaded;
            setListing((current) => ({
                ...current,
                version: listingVersion,
                media: [...current.media, media],
            }));
        },
    });

    return (
        <section className="mt-10 border-t border-line pt-8">
            <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                    <FileUp size={18} />
                </span>
                <div>
                    <h3 className="text-xl font-semibold">Energielabel</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">
                        Bekijk het gevonden label en bewaar het officiële
                        document bij je concept.
                    </p>
                </div>
            </div>

            {energy ? (
                <div className="mt-5 flex items-center gap-4 bg-emerald-50 p-5">
                    <span className="grid h-14 min-w-20 place-items-center bg-emerald-700 px-3 text-xl font-bold text-white">
                        {energyLabelNames[energy.labelClass] ??
                            energy.labelClass}
                    </span>
                    <p className="font-semibold">Energielabel gevonden</p>
                </div>
            ) : (
                <div className="mt-5 flex items-start gap-3 bg-amber-50 p-5 text-amber-950">
                    <CircleAlert className="mt-0.5 shrink-0" size={19} />
                    <div>
                        <p className="font-semibold">
                            Geen energielabel gevonden
                        </p>
                        <p className="mt-1 text-sm leading-6">
                            Voeg het officiële PDF-document toe zodra je dit
                            hebt ontvangen.
                        </p>
                    </div>
                </div>
            )}

            {documents.length ? (
                <div className="mt-4 space-y-2">
                    {documents.map((document) => (
                        <a
                            key={document.id}
                            href={`/${document.storageKey}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-3 border border-line px-4 py-3 text-sm font-semibold hover:bg-background"
                        >
                            <FileImage size={17} className="text-brand" />
                            <span className="truncate">
                                {document.fileName}
                            </span>
                        </a>
                    ))}
                </div>
            ) : null}

            <label className="mt-4 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold">
                {upload.isPending ? (
                    <LoaderCircle className="animate-spin" size={16} />
                ) : (
                    <FileUp size={16} />
                )}
                {documents.length ? "Nog een PDF toevoegen" : "PDF toevoegen"}
                <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    disabled={!editable || upload.isPending}
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload.mutate(file);
                        event.target.value = "";
                    }}
                />
            </label>
            {upload.error ? (
                <p className="mt-3 text-sm text-red-700">
                    {upload.error.message}
                </p>
            ) : null}
        </section>
    );
}

const movableItemCategories: Array<{
    value: MovableItemCategory;
    label: string;
}> = [
    { value: "STAYS", label: "Blijft achter" },
    { value: "GOES", label: "Gaat mee" },
    { value: "FOR_TAKEOVER", label: "Ter overname" },
];

const movableItemSuggestions = [
    "Gordijnen en rails",
    "Verlichting",
    "Vloerafwerking",
    "Inbouwapparatuur",
    "Losse keukenapparatuur",
    "Kasten",
    "Wasmachine en droger",
    "Tuinmeubilair",
    "Zonwering",
    "Laadpaal",
    "Rookmelder(s)",
    "Thermostaat",
    "Toiletrolhouder",
    "Toiletborstel(houder)",
];

function MovableItemsSection({
    listing,
    setListing,
    items,
    setItems,
    editable,
}: {
    listing: ListingView;
    setListing: React.Dispatch<React.SetStateAction<ListingView>>;
    items: MovableItem[];
    setItems: (items: MovableItem[]) => void;
    editable: boolean;
}) {
    const uploadedDocuments = listing.media.filter(
        (item) =>
            item.kind === "DOCUMENT" && item.altTextNl === "Lijst van zaken",
    );
    const [mode, setMode] = useState<"create" | "upload">(
        uploadedDocuments.length && !items.length ? "upload" : "create",
    );
    const upload = useMutation({
        mutationFn: async (file: File) => {
            const form = new FormData();
            form.set("file", file);
            form.set("kind", "DOCUMENT");
            form.set("documentRole", "MOVABLE_ITEMS");
            const response = await fetch(`/api/listings/${listing.id}/media`, {
                method: "POST",
                body: form,
            });
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error?.message ?? "Upload mislukt");
            return payload.data as UploadedMedia;
        },
        onSuccess(uploaded) {
            const { listingVersion, ...media } = uploaded;
            setListing((current) => ({
                ...current,
                version: listingVersion,
                media: [...current.media, media],
            }));
        },
    });
    const remove = useMutation({
        mutationFn: async (mediaId: string) => {
            const response = await fetch(
                `/api/listings/${listing.id}/media/${mediaId}`,
                { method: "DELETE" },
            );
            if (!response.ok) throw new Error("Verwijderen mislukt");
            return mediaId;
        },
        onSuccess(mediaId) {
            setListing((current) => ({
                ...current,
                version: current.version + 1,
                media: current.media.filter((item) => item.id !== mediaId),
            }));
        },
    });
    const addItem = (name = "") =>
        setItems([
            ...items,
            {
                id: crypto.randomUUID(),
                name,
                category: "STAYS",
                notes: "",
            },
        ]);
    const updateItem = (id: string, patch: Partial<MovableItem>) =>
        setItems(
            items.map((item) =>
                item.id === id ? { ...item, ...patch } : item,
            ),
        );

    return (
        <div>
            <SectionHeading
                icon={FileText}
                title="Lijst van zaken"
                text="Leg vast welke roerende zaken achterblijven, meegaan of ter overname worden aangeboden. Kopers kunnen de lijst als PDF downloaden."
            />
            <div className="mt-7 inline-flex border border-line p-1">
                <button
                    type="button"
                    onClick={() => setMode("create")}
                    className={`px-4 py-2 text-sm font-semibold ${mode === "create" ? "bg-brand text-white" : "text-muted"}`}
                >
                    Zelf maken
                </button>
                <button
                    type="button"
                    onClick={() => setMode("upload")}
                    className={`px-4 py-2 text-sm font-semibold ${mode === "upload" ? "bg-brand text-white" : "text-muted"}`}
                >
                    PDF uploaden
                </button>
            </div>

            {mode === "create" ? (
                <div className="mt-7">
                    <div className="border border-line bg-background p-5">
                        <h3 className="font-semibold">Veelvoorkomende zaken</h3>
                        <p className="mt-1 text-sm text-muted">
                            Voeg relevante voorbeelden toe en pas ze daarna aan.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {movableItemSuggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    disabled={
                                        !editable ||
                                        items.some(
                                            (item) => item.name === suggestion,
                                        )
                                    }
                                    onClick={() => addItem(suggestion)}
                                    className="inline-flex items-center gap-1.5 border border-line bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40"
                                >
                                    <Plus size={15} /> {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-5 space-y-3">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="grid gap-3 border border-line p-4 md:grid-cols-[1.2fr_0.8fr_1fr_auto] md:items-end"
                            >
                                <Input
                                    label="Zaak"
                                    value={item.name}
                                    disabled={!editable}
                                    maxLength={120}
                                    onChange={(event) =>
                                        updateItem(item.id, {
                                            name: event.target.value,
                                        })
                                    }
                                />
                                <label className="block text-sm font-semibold">
                                    Categorie
                                    <select
                                        value={item.category}
                                        disabled={!editable}
                                        onChange={(event) =>
                                            updateItem(item.id, {
                                                category: event.target
                                                    .value as MovableItemCategory,
                                            })
                                        }
                                        className="input mt-2"
                                    >
                                        {movableItemCategories.map(
                                            (category) => (
                                                <option
                                                    key={category.value}
                                                    value={category.value}
                                                >
                                                    {category.label}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </label>
                                <Input
                                    label="Toelichting (optioneel)"
                                    value={item.notes}
                                    disabled={!editable}
                                    maxLength={240}
                                    onChange={(event) =>
                                        updateItem(item.id, {
                                            notes: event.target.value,
                                        })
                                    }
                                />
                                <button
                                    type="button"
                                    title="Zaak verwijderen"
                                    disabled={!editable}
                                    onClick={() =>
                                        setItems(
                                            items.filter(
                                                (current) =>
                                                    current.id !== item.id,
                                            ),
                                        )
                                    }
                                    className="grid size-11 place-items-center border border-line text-red-700 disabled:opacity-40"
                                >
                                    <Trash2 size={17} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        disabled={!editable || items.length >= 150}
                        onClick={() => addItem()}
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                    >
                        <Plus size={16} /> Eigen zaak toevoegen
                    </button>
                    {items.length ? (
                        <p className="mt-4 text-sm text-muted">
                            Sla het concept op om de downloadbare PDF bij te
                            werken.
                        </p>
                    ) : null}
                </div>
            ) : (
                <div className="mt-7">
                    <p className="text-sm leading-6 text-muted">
                        Upload een bestaande roerende-zakenlijst als PDF van
                        maximaal 20 MB.
                    </p>
                    <label className="mt-4 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white">
                        {upload.isPending ? (
                            <LoaderCircle className="animate-spin" size={16} />
                        ) : (
                            <FileUp size={16} />
                        )}
                        PDF kiezen
                        <input
                            type="file"
                            accept="application/pdf"
                            className="sr-only"
                            disabled={!editable || upload.isPending}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) upload.mutate(file);
                                event.target.value = "";
                            }}
                        />
                    </label>
                    <div className="mt-5 space-y-2">
                        {uploadedDocuments.map((document) => (
                            <div
                                key={document.id}
                                className="flex items-center justify-between gap-3 border border-line px-4 py-3"
                            >
                                <a
                                    href={`/${document.storageKey}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex min-w-0 items-center gap-3 text-sm font-semibold text-brand"
                                >
                                    <FileText size={17} />
                                    <span className="truncate">
                                        {document.fileName}
                                    </span>
                                </a>
                                <button
                                    type="button"
                                    title="PDF verwijderen"
                                    disabled={!editable || remove.isPending}
                                    onClick={() => remove.mutate(document.id)}
                                    className="grid size-9 shrink-0 place-items-center text-red-700 disabled:opacity-40"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                    {upload.error || remove.error ? (
                        <p className="mt-3 text-sm text-red-700">
                            {(upload.error ?? remove.error)?.message}
                        </p>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function MediaSection({
    listing,
    setListing,
    editable,
    editor,
    setEditor,
}: {
    listing: ListingView;
    setListing: React.Dispatch<React.SetStateAction<ListingView>>;
    editable: boolean;
    editor: EditorState;
    setEditor: React.Dispatch<React.SetStateAction<EditorState>>;
}) {
    const upload = useMutation({
        mutationFn: async ({
            files,
            kind,
        }: {
            files: File[];
            kind: "PHOTO" | "FLOOR_PLAN_STATIC";
        }) => {
            const uploaded: MediaItem[] = [];
            let listingVersion = listing.version;
            for (const file of files) {
                const form = new FormData();
                form.set("file", file);
                form.set("kind", kind);
                const response = await fetch(
                    `/api/listings/${listing.id}/media`,
                    {
                        method: "POST",
                        body: form,
                    },
                );
                const payload = await response.json();
                if (!response.ok)
                    throw new Error(payload.error?.message ?? "Upload mislukt");
                const { listingVersion: nextListingVersion, ...media } =
                    payload.data as UploadedMedia;
                listingVersion = nextListingVersion;
                uploaded.push(media);
            }
            return { media: uploaded, listingVersion };
        },
        onSuccess(uploaded) {
            setListing((current) => ({
                ...current,
                version: uploaded.listingVersion,
                media: [...current.media, ...uploaded.media],
            }));
        },
    });
    const remove = useMutation({
        mutationFn: async (mediaId: string) => {
            const response = await fetch(
                `/api/listings/${listing.id}/media/${mediaId}`,
                { method: "DELETE" },
            );
            if (!response.ok) throw new Error("Verwijderen mislukt");
            return mediaId;
        },
        onSuccess(mediaId) {
            setListing((current) => ({
                ...current,
                media: current.media.filter((item) => item.id !== mediaId),
            }));
        },
    });
    return (
        <div>
            <SectionHeading
                icon={FileImage}
                title="Foto's & plattegronden"
                text="Voeg woningfoto's en plattegronden afzonderlijk toe. Per bestand geldt een maximum van 20 MB."
            />
            <section className="mt-8">
                <h3 className="text-xl font-semibold">{"Woningfoto's"}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                    {"Selecteer meerdere JPG-, PNG- of WebP-foto's tegelijk."}
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white">
                    {upload.isPending ? (
                        <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                        <ImagePlus size={17} />
                    )}{" "}
                    {"Woningfoto's kiezen"}
                    <input
                        type="file"
                        multiple
                        className="sr-only"
                        disabled={!editable || upload.isPending}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            if (files.length)
                                upload.mutate({ files, kind: "PHOTO" });
                            event.target.value = "";
                        }}
                    />
                </label>
                <MediaGrid
                    media={listing.media.filter(
                        (item) => item.kind === "PHOTO",
                    )}
                    editable={editable}
                    remove={(mediaId) => remove.mutate(mediaId)}
                    label="Foto"
                />
            </section>
            {upload.error ? (
                <p className="mt-4 text-sm text-red-700">
                    {upload.error.message}
                </p>
            ) : null}
            <section className="mt-9 border-t border-line pt-7">
                <h3 className="text-xl font-semibold">Plattegronden</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                    Upload meerdere afbeeldingen of PDF-bestanden, of voeg een
                    interactieve Floorplanner-link toe.
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold text-brand">
                    {upload.isPending ? (
                        <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                        <FileUp size={17} />
                    )}{" "}
                    Plattegronden kiezen
                    <input
                        type="file"
                        multiple
                        className="sr-only"
                        disabled={!editable || upload.isPending}
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            if (files.length)
                                upload.mutate({
                                    files,
                                    kind: "FLOOR_PLAN_STATIC",
                                });
                            event.target.value = "";
                        }}
                    />
                </label>
                <MediaGrid
                    media={listing.media.filter(
                        (item) => item.kind === "FLOOR_PLAN_STATIC",
                    )}
                    editable={editable}
                    remove={(mediaId) => remove.mutate(mediaId)}
                    label="Plattegrond"
                />
                <div className="mt-7 border-t border-line pt-6">
                    <Input
                        label="Floorplanner embed-URL"
                        type="url"
                        disabled={!editable}
                        value={editor.floorplannerEmbedUrl}
                        onChange={(event) =>
                            setEditor((current) => ({
                                ...current,
                                floorplannerEmbedUrl: event.target.value,
                            }))
                        }
                        placeholder="https://floorplanner.com/..."
                    />
                    <p className="mt-2 text-xs leading-5 text-muted">
                        Gebruik de Viewer- of Spaceplanner-link van een openbaar
                        Level 3-project. De interactieve plattegrond wordt na
                        opslaan aan de advertentie gekoppeld.{" "}
                        <a
                            href="https://floorplanner.readme.io/reference/viewer-spaceplanner"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-brand underline underline-offset-2"
                        >
                            Zo vind je de embed-URL
                            <ExternalLink size={12} />
                        </a>
                    </p>
                </div>
            </section>
        </div>
    );
}

function MediaGrid({
    media,
    editable,
    remove,
    label,
}: {
    media: MediaItem[];
    editable: boolean;
    remove: (mediaId: string) => void;
    label: string;
}) {
    if (!media.length) return null;

    return (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {media.map((item) => (
                <article
                    key={item.id}
                    className="group relative overflow-hidden rounded-2xl border border-line bg-background"
                >
                    {item.mimeType.startsWith("image/") ? (
                        <Image
                            src={`/${item.storageKey}`}
                            alt=""
                            width={800}
                            height={480}
                            className="h-36 w-full object-cover"
                        />
                    ) : (
                        <div className="grid h-36 place-items-center">
                            <FileImage size={30} className="text-brand" />
                        </div>
                    )}
                    <div className="p-3">
                        <p className="truncate text-xs font-semibold">
                            {item.fileName}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">{label}</p>
                    </div>
                    {editable ? (
                        <button
                            type="button"
                            onClick={() => remove(item.id)}
                            aria-label={`${item.fileName} verwijderen`}
                            className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-white text-red-700 shadow"
                        >
                            <Trash2 size={16} />
                        </button>
                    ) : null}
                </article>
            ))}
        </div>
    );
}

const biddingMethods = [
    {
        value: "PRIVATE",
        title: "Onderhands bieden",
        text: "Biedingen zijn alleen zichtbaar voor jou en mogen tijdens de looptijd worden aangevuld.",
    },
    {
        value: "SEALED",
        title: "Gesloten inschrijving",
        text: "Iedere bieder brengt één definitief bod uit vóór de sluiting.",
    },
    {
        value: "OPEN",
        title: "Transparant opbieden",
        text: "Het hoogste bod is zichtbaar en een nieuw bod volgt minimaal de ingestelde biedstap.",
    },
] as const;

function PriceAndBiddingSection({
    listing,
    editor,
    setEditor,
    editable,
    estimate,
}: {
    listing: ListingView;
    editor: EditorState;
    setEditor: React.Dispatch<React.SetStateAction<EditorState>>;
    editable: boolean;
    estimate: {
        mutate: () => void;
        isPending: boolean;
        data?: {
            estimatedValueCents: string;
            lowerBoundCents: string;
            upperBoundCents: string;
            confidence: number;
            tier: string;
            cached: boolean;
        };
        error: Error | null;
    };
}) {
    const value = estimate.data;
    const set = (key: string) => (event: ChangeEvent<HTMLInputElement>) =>
        setEditor((current) => ({
            ...current,
            [key]: event.target.value,
        }));
    return (
        <div>
            <SectionHeading
                icon={BadgeEuro}
                title="Prijs & bieden"
                text="Bepaal de prijsstrategie en leg vast hoe, wanneer en onder welke voorwaarden geïnteresseerden kunnen bieden."
            />
            <fieldset
                disabled={!editable}
                className="mt-9 space-y-9 disabled:opacity-70"
            >
                <div>
                    <h3 className="text-lg font-semibold">Prijsstelling</h3>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                        <Input
                            label={
                                listing.purpose === "SALE"
                                    ? "Vraagprijs (€)"
                                    : "Huurprijs per maand (€)"
                            }
                            type="number"
                            min="1"
                            step="1"
                            value={
                                listing.purpose === "SALE"
                                    ? editor.askingPrice
                                    : editor.monthlyRent
                            }
                            onChange={set(
                                listing.purpose === "SALE"
                                    ? "askingPrice"
                                    : "monthlyRent",
                            )}
                        />
                        {listing.purpose === "RENT" ? (
                            <Input
                                label="Servicekosten per maand (€)"
                                type="number"
                                min="0"
                                step="0.01"
                                value={editor.serviceCosts}
                                onChange={set("serviceCosts")}
                            />
                        ) : (
                            <div>
                                <Input
                                    label="Minimaal bod (€)"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={editor.minimumBid}
                                    onChange={set("minimumBid")}
                                />
                                <p className="mt-2 text-xs leading-5 text-muted">
                                    Dit bedrag is niet zichtbaar op de
                                    advertentie.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-line pt-8">
                    <h3 className="text-lg font-semibold">Manier van bieden</h3>
                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        {biddingMethods.map((method) => (
                            <label
                                key={method.value}
                                className={`cursor-pointer border p-4 transition ${editor.biddingMethod === method.value ? "border-brand bg-brand/5" : "border-line hover:border-brand/40"}`}
                            >
                                <span className="flex items-center gap-3">
                                    <input
                                        type="radio"
                                        name="biddingMethod"
                                        value={method.value}
                                        checked={
                                            editor.biddingMethod ===
                                            method.value
                                        }
                                        onChange={() =>
                                            setEditor((current) => ({
                                                ...current,
                                                biddingMethod: method.value,
                                            }))
                                        }
                                        className="size-4 accent-brand"
                                    />
                                    <span className="font-semibold">
                                        {method.title}
                                    </span>
                                </span>
                                <span className="mt-3 block text-xs leading-5 text-muted">
                                    {method.text}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="grid gap-5 border-t border-line pt-8 sm:grid-cols-2">
                    <Input
                        label="Bieden mogelijk vanaf"
                        type="datetime-local"
                        value={editor.bidWindowOpensAt}
                        onChange={set("bidWindowOpensAt")}
                    />
                    <Input
                        label={
                            editor.biddingMethod === "SEALED"
                                ? "Inschrijving sluit"
                                : "Bieden mogelijk tot"
                        }
                        type="datetime-local"
                        value={editor.bidWindowClosesAt}
                        onChange={set("bidWindowClosesAt")}
                    />
                    {editor.biddingMethod === "OPEN" ? (
                        <Input
                            label="Minimale biedstap (€)"
                            type="number"
                            min="1"
                            step="1"
                            value={editor.bidIncrement}
                            onChange={set("bidIncrement")}
                        />
                    ) : null}
                    <label className="flex items-center gap-3 self-end border border-line px-4 py-3 text-sm font-semibold">
                        <input
                            type="checkbox"
                            checked={Boolean(editor.allowBidConditions)}
                            onChange={(event) =>
                                setEditor((current) => ({
                                    ...current,
                                    allowBidConditions: event.target.checked,
                                }))
                            }
                            className="size-4 accent-brand"
                        />
                        Biedingen met voorwaarden toestaan
                    </label>
                </div>
            </fieldset>

            <div className="mt-10 border-t border-line pt-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className="flex items-center gap-2 text-lg font-semibold">
                            <Sparkles size={18} className="text-brand" />
                            Waardeschatting
                        </h3>
                        <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                            Gebruik woningkenmerken en foto&apos;s voor een
                            indicatieve marktwaarde en bandbreedte.
                        </p>
                    </div>
                    <button
                        onClick={() => estimate.mutate()}
                        disabled={estimate.isPending}
                        className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-white disabled:opacity-60"
                    >
                        {estimate.isPending ? (
                            <LoaderCircle className="animate-spin" size={18} />
                        ) : (
                            <BadgeEuro size={18} />
                        )}{" "}
                        Bereken indicatie
                    </button>
                </div>
            </div>
            {estimate.error ? (
                <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    {estimate.error.message}
                </p>
            ) : null}
            {value ? (
                <div className="mt-8 overflow-hidden rounded-3xl bg-brand-dark p-7 text-white sm:p-9">
                    <p className="text-sm font-semibold uppercase tracking-wider text-accent">
                        Geschatte marktwaarde
                    </p>
                    <p className="mt-3 text-4xl font-semibold">
                        {money(value.estimatedValueCents)}
                    </p>
                    <p className="mt-3 text-white/65">
                        Bandbreedte {money(value.lowerBoundCents)} –{" "}
                        {money(value.upperBoundCents)}
                    </p>
                    <div className="mt-7 grid gap-3 sm:grid-cols-3">
                        <Stat label="Modeltier" value={value.tier} />
                        <Stat
                            label="Zekerheid"
                            value={`${Math.round(value.confidence * 100)}%`}
                        />
                        <Stat
                            label="Resultaat"
                            value={value.cached ? "Uit cache" : "Nieuw"}
                        />
                    </div>
                    <p className="mt-6 text-xs leading-5 text-white/55">
                        Dit is een geautomatiseerde indicatie, geen
                        taxatierapport of financieel advies.
                    </p>
                </div>
            ) : null}
        </div>
    );
}

function PublishSection({
    listing,
    verified,
    paidOrder,
    validate,
    startIdin,
    checkout,
    publish,
}: {
    listing: ListingView;
    verified: boolean;
    paidOrder?: { package: string; status: string };
    validate: {
        mutate: () => void;
        isPending: boolean;
        data?: {
            ready: boolean;
            issues: Array<{ field: string; message: string }>;
        };
        error: Error | null;
    };
    startIdin: { mutate: () => void; isPending: boolean; error: Error | null };
    checkout: {
        mutate: (value: "BRONZE" | "SILVER" | "GOLD") => void;
        isPending: boolean;
        error: Error | null;
    };
    publish: {
        mutate: (value: "BRONZE" | "SILVER" | "GOLD") => void;
        isPending: boolean;
        error: Error | null;
    };
}) {
    const [selectedPackage, setSelectedPackage] = useState<
        "BRONZE" | "SILVER" | "GOLD"
    >((paidOrder?.package as "BRONZE" | "SILVER" | "GOLD") ?? "SILVER");
    const ready = ["READY_FOR_VERIFICATION", "LIVE"].includes(listing.status);
    return (
        <div>
            <SectionHeading
                icon={Send}
                title="Controleren & publiceren"
                text="iDIN wordt pas hier verplicht. De betaalde pakketkeuze geldt voor deze advertentie en wordt één keer verbruikt."
            />
            <div className="mt-8 space-y-3">
                <GateRow
                    done={ready}
                    icon={Check}
                    title="Advertentie compleet"
                    text={
                        validate.isPending
                            ? "Advertentie wordt gecontroleerd..."
                            : "Verplichte velden en minimaal één foto"
                    }
                />
                <GateRow
                    done={verified}
                    icon={Fingerprint}
                    title="Identiteit via iDIN"
                    text="Alleen vereist voor Live of externe publicatie"
                    action={
                        ready && !verified ? (
                            <button
                                onClick={() => startIdin.mutate()}
                                disabled={startIdin.isPending}
                                className="action-button"
                            >
                                Start iDIN
                            </button>
                        ) : null
                    }
                />
                <GateRow
                    done={Boolean(paidOrder)}
                    icon={BadgeEuro}
                    title="Publicatiepakket"
                    text={
                        paidOrder
                            ? `${paidOrder.package} betaald`
                            : "Kies hieronder een pakket"
                    }
                />
            </div>
            {!validate.isPending && validate.data && !validate.data.ready ? (
                <div className="mt-5 rounded-2xl bg-amber-50 p-5">
                    <p className="font-semibold text-amber-900">
                        Vul minimaal het volgende aan
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                        {validate.data.issues.map((issue) => (
                            <li key={`${issue.field}-${issue.message}`}>
                                {issue.message}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {[
                validate.error,
                startIdin.error,
                checkout.error,
                publish.error,
            ].find(Boolean) ? (
                <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    {
                        [
                            validate.error,
                            startIdin.error,
                            checkout.error,
                            publish.error,
                        ].find(Boolean)?.message
                    }
                </p>
            ) : null}
            <div className="mt-9 grid gap-4 md:grid-cols-3">
                {(
                    [
                        ["BRONZE", "€ 99", "Platformpublicatie"],
                        ["SILVER", "€ 199", "Platform + Funda"],
                        ["GOLD", "€ 299", "Extra zichtbaarheid"],
                    ] as const
                ).map(([name, price, text]) => (
                    <button
                        type="button"
                        key={name}
                        onClick={() => setSelectedPackage(name)}
                        className={`rounded-3xl border p-5 text-left transition ${selectedPackage === name ? "border-brand bg-brand/5 ring-2 ring-brand/10" : "border-line"}`}
                    >
                        <p className="text-xs font-semibold text-brand">
                            {name}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">{price}</p>
                        <p className="mt-2 text-sm text-muted">{text}</p>
                    </button>
                ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
                {!paidOrder ? (
                    <button
                        type="button"
                        disabled={!ready || !verified || checkout.isPending}
                        onClick={() => checkout.mutate(selectedPackage)}
                        className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-white disabled:opacity-40"
                    >
                        <BadgeEuro size={17} /> Pakket betalen
                    </button>
                ) : null}
                {paidOrder && listing.status !== "LIVE" ? (
                    <button
                        type="button"
                        disabled={!ready || !verified || publish.isPending}
                        onClick={() =>
                            publish.mutate(
                                paidOrder.package as
                                    | "BRONZE"
                                    | "SILVER"
                                    | "GOLD",
                            )
                        }
                        className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-brand-dark disabled:opacity-40"
                    >
                        <Send size={17} /> Nu publiceren
                    </button>
                ) : null}
            </div>
            {listing.publications.length > 0 ? (
                <div className="mt-8 border-t border-line pt-6">
                    <h3 className="font-semibold">Publicatiestatus</h3>
                    <div className="mt-3 space-y-2">
                        {listing.publications.map((item) => (
                            <div
                                key={item.id}
                                className="flex justify-between rounded-xl bg-background px-4 py-3 text-sm"
                            >
                                <span>{item.channel}</span>
                                <strong>{item.status}</strong>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

type BidView = {
    id: string;
    bidderPseudonym: string;
    amountCents: string;
    submittedAt: string;
    resolutiveConditions: unknown;
    events: Array<{ type: string }>;
};
function BidsSection({
    listing,
    bids,
    loading,
    onDecision,
}: {
    listing: ListingView;
    bids: BidView[];
    loading: boolean;
    onDecision: () => void;
}) {
    const decision = useMutation({
        mutationFn: ({
            bidId,
            value,
        }: {
            bidId: string;
            value: "ACCEPTED" | "REJECTED";
        }) =>
            requestData(`/api/listings/${listing.id}/bids/${bidId}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ decision: value }),
            }),
        onSuccess: onDecision,
    });
    return (
        <div>
            <SectionHeading
                icon={ShieldCheck}
                title="Onveranderbaar biedlogboek"
                text="Alle biedingen staan chronologisch met bedrag, tijdstip en ontbindende voorwaarden. Identiteiten zijn gepseudonimiseerd."
            />
            {loading ? (
                <LoaderCircle className="mt-8 animate-spin text-brand" />
            ) : bids.length === 0 ? (
                <p className="mt-8 rounded-2xl bg-background p-6 text-muted">
                    Er zijn nog geen biedingen ontvangen.
                </p>
            ) : (
                <div className="mt-8 space-y-4">
                    {bids.map((bid, index) => {
                        const decided = bid.events.some((event) =>
                            ["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(
                                event.type,
                            ),
                        );
                        return (
                            <article
                                key={bid.id}
                                className="rounded-2xl border border-line p-5"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold text-brand">
                                            BOD{" "}
                                            {String(index + 1).padStart(2, "0")}
                                        </p>
                                        <h3 className="mt-1 text-xl font-semibold">
                                            {money(bid.amountCents)}
                                        </h3>
                                        <p className="mt-1 text-sm text-muted">
                                            {bid.bidderPseudonym} ·{" "}
                                            {new Date(
                                                bid.submittedAt,
                                            ).toLocaleString("nl-NL")}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">
                                        {bid.events.at(-1)?.type ?? "SUBMITTED"}
                                    </span>
                                </div>
                                <pre className="mt-4 overflow-auto rounded-xl bg-background p-3 text-xs text-muted">
                                    {JSON.stringify(
                                        bid.resolutiveConditions,
                                        null,
                                        2,
                                    )}
                                </pre>
                                {!decided && listing.status === "LIVE" ? (
                                    <div className="mt-4 flex gap-2">
                                        <button
                                            onClick={() =>
                                                decision.mutate({
                                                    bidId: bid.id,
                                                    value: "ACCEPTED",
                                                })
                                            }
                                            className="action-button"
                                        >
                                            Accepteren
                                        </button>
                                        <button
                                            onClick={() =>
                                                decision.mutate({
                                                    bidId: bid.id,
                                                    value: "REJECTED",
                                                })
                                            }
                                            className="action-button"
                                        >
                                            Afwijzen
                                        </button>
                                    </div>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            )}
            {["UNDER_OFFER", "SOLD", "RENTED"].includes(listing.status) ? (
                <a
                    href={`/api/listings/${listing.id}/bid-logbook`}
                    className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-white"
                >
                    <ShieldCheck size={17} /> Download biedlogboek (PDF)
                </a>
            ) : null}
        </div>
    );
}

function SectionHeading({
    icon: Icon,
    title,
    text,
}: {
    icon: typeof Building2;
    title: string;
    text: string;
}) {
    return (
        <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-brand-dark">
                <Icon size={21} />
            </span>
            <div>
                <h2 className="text-2xl font-semibold">{title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    {text}
                </p>
            </div>
        </div>
    );
}
function Input({
    label,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
    return (
        <label className="block text-sm font-semibold">
            {label}
            <input {...props} className="input mt-2" />
        </label>
    );
}
function TextArea({
    label,
    ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
    return (
        <label className="block text-sm font-semibold">
            {label}
            <textarea {...props} className="input mt-2 min-h-28 py-3" />
        </label>
    );
}
function GateRow({
    done,
    icon: Icon,
    title,
    text,
    action,
}: {
    done: boolean;
    icon: typeof Check;
    title: string;
    text: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-line p-4">
            <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${done ? "bg-brand/10 text-brand" : "bg-background text-muted"}`}
            >
                {done ? <Check size={18} /> : <Icon size={18} />}
            </span>
            <div className="min-w-0 flex-1">
                <p className="font-semibold">{title}</p>
                <p className="text-xs text-muted">{text}</p>
            </div>
            {action}
        </div>
    );
}
function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white/8 p-4">
            <p className="text-xs text-white/55">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold">{value}</p>
        </div>
    );
}
function money(cents: string) {
    return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(Number(cents) / 100);
}
function statusText(status: string) {
    return (
        (
            {
                DRAFT: "Concept",
                READY_FOR_VERIFICATION: "Klaar voor verificatie",
                LIVE: "Live",
                UNDER_OFFER: "Onder bod",
                SOLD: "Verkocht",
                RENTED: "Verhuurd",
            } as Record<string, string>
        )[status] ?? status
    );
}
