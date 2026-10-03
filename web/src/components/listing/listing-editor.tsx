"use client";

import { useListingCopy } from "@/lib/messages/use-listing-copy";
import { translateListingIssue } from "@/lib/messages/listing-copy";

import { useState, type ChangeEvent } from "react";
import type { EstimateResponse } from "@/lib/schemas/estimator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListingImage } from "@/components/listing/listing-image";
import {
    BadgeEuro,
    Bot,
    Building2,
    CalendarDays,
    Check,
    ChevronRight,
    CircleAlert,
    ClipboardList,
    ExternalLink,
    FileImage,
    FileText,
    FileUp,
    Fingerprint,
    Flower2,
    ImagePlus,
    Info,
    Landmark,
    LoaderCircle,
    MessageSquare,
    Plus,
    Save,
    Send,
    ShieldCheck,
    Sparkles,
    Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerListingMessages } from "@/components/messages/owner-listing-messages";
import {
    erfpachtOptions,
    parkingOptions,
    propertyAmenityOptions,
    roofTypeOptions,
    type ErfpachtType,
    type ParkingOption,
    type PropertyAmenity,
    type RoofType,
} from "@/lib/property-options";
import { ViewingPlanner } from "@/components/listing/viewing-planner";
import {
    getQuestionnaireSections,
    type QuestionnaireAnswer,
    type QuestionnaireAnswerValue,
} from "@/features/listings/property-questionnaire";
import {
    gardenOrientationLabels,
    parsePropertyLayout,
    type GardenOrientation,
} from "@/features/listings/garden";
import {
    clearNewListingDraft,
    type NewListingDraft,
} from "@/features/listings/create-listing-draft";

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
        questionnaireAnswers?: QuestionnaireAnswer[];
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
        erfpachtType: ErfpachtType;
        erfpachtCanonCents: string | null;
        erfpachtDetails: string | null;
        erfpachtEndDate: string | null;
        layout: unknown;
        energyLabels: Array<{
            labelClass: string;
            primaryFossilEnergyKwhSqmYear: number | null;
        }>;
    };
    media: MediaItem[];
    floorPlans: Array<{ embedUrl: string | null }>;
    identityAttempts: Array<{ status: string }>;
    identityVerified: boolean;
    publications: Array<{
        id: string;
        channel: string;
        status: string;
        externalReference: string | null;
    }>;
};

type Section =
    | "details"
    | "media"
    | "movableItems"
    | "questionnaire"
    | "estimate"
    | "viewings"
    | "publish"
    | "bids"
    | "messages";
type ApiError = { error?: { message?: string } };
type EditorState = {
    purpose: "SALE" | "RENT";
    propertyType: ListingView["property"]["propertyType"];
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
    erfpachtType: ErfpachtType;
    erfpachtCanon: string;
    erfpachtDetails: string;
    erfpachtEndDate: string;
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
    questionnaireAnswers: QuestionnaireAnswer[];
    hasGarden: boolean;
    gardenOrientation: GardenOrientation | "";
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
        { id: "questionnaire", label: "Vragenlijst", icon: ClipboardList },
        { id: "estimate", label: "Prijs & bieden", icon: BadgeEuro },
        { id: "viewings", label: "Bezichtigingen", icon: CalendarDays },
        { id: "publish", label: "Controleren & publiceren", icon: Send },
        { id: "bids", label: "Biedlogboek", icon: ShieldCheck },
        { id: "messages", label: "Berichten", icon: MessageSquare },
    ];

function buildSkeletonListing(
    draft: NewListingDraft | null | undefined,
): ListingView {
    const address = draft?.address;
    const property = draft?.property;
    return {
        id: "",
        purpose: "SALE",
        status: "DRAFT",
        version: 1,
        publicSlug: null,
        titleNl: null,
        titleEn: null,
        descriptionNl: null,
        descriptionEn: null,
        askingPriceCents: null,
        monthlyRentCents: null,
        serviceCostsCents: null,
        viewingNotes: null,
        biddingMethod: "PRIVATE",
        minimumBidCents: null,
        bidIncrementCents: null,
        allowBidConditions: true,
        bidWindowOpensAt: null,
        bidWindowClosesAt: null,
        attributes: null,
        property: {
            postcode: address?.postcode ?? "",
            houseNumber: address ? Number(address.houseNumber) : 0,
            houseNumberAddition: address?.addition || null,
            street: address?.street ?? "",
            city: address?.city ?? "",
            propertyType: property?.suggestedPropertyType ?? "HOUSE",
            livingAreaSqm: property?.livingAreaSqm ?? null,
            officialLandAreaSqm: property?.officialLandAreaSqm ?? null,
            roomCount: property?.roomCount ?? null,
            bedroomCount: property?.bedroomCount ?? null,
            bathroomCount: null,
            floorCount: null,
            roofType: null,
            externalStorageAreaSqm: null,
            amenities: [],
            parkingOptions: [],
            parkingSpacePriceCents: null,
            constructionYear: property?.constructionYear ?? null,
            isMonument: false,
            erfpachtType: "UNKNOWN",
            erfpachtCanonCents: null,
            erfpachtDetails: null,
            erfpachtEndDate: null,
            layout: null,
            energyLabels: property?.energy
                ? [
                      {
                          labelClass: property.energy.labelClass,
                          primaryFossilEnergyKwhSqmYear:
                              property.energy.primaryFossilEnergyKwhSqmYear,
                      },
                  ]
                : [],
        },
        media: [],
        floorPlans: [],
        identityAttempts: [],
        identityVerified: false,
        publications: [],
    };
}

export function ListingEditor({
    initialListing,
    draft,
    messageUnreadCount = 0,
}: {
    initialListing: ListingView | null;
    draft?: NewListingDraft | null;
    messageUnreadCount?: number;
}) {
    const { t } = useListingCopy();
    const router = useRouter();
    const queryClient = useQueryClient();
    const isCreate = initialListing === null;
    const [listing, setListing] = useState<ListingView>(
        () => initialListing ?? buildSkeletonListing(draft),
    );
    const [section, setSection] = useState<Section>("details");
    const [messageUnread, setMessageUnread] = useState(messageUnreadCount);
    const [notice, setNotice] = useState("");
    const [verificationError, setVerificationError] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const [woz, setWoz] = useState({ amount: "", year: "" });
    const [editor, setEditor] = useState<EditorState>({
        purpose: listing.purpose,
        propertyType: listing.property.propertyType,
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
        erfpachtType: listing.property.erfpachtType ?? "UNKNOWN",
        erfpachtCanon: euros(listing.property.erfpachtCanonCents),
        erfpachtDetails: listing.property.erfpachtDetails ?? "",
        erfpachtEndDate: listing.property.erfpachtEndDate?.slice(0, 10) ?? "",
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
        questionnaireAnswers: listing.attributes?.questionnaireAnswers ?? [],
        hasGarden: Boolean(
            parsePropertyLayout(listing.property.layout)?.garden,
        ),
        gardenOrientation:
            parsePropertyLayout(listing.property.layout)?.garden?.orientation ??
            "",
    });

    const editable =
        isCreate ||
        ["DRAFT", "READY_FOR_VERIFICATION"].includes(listing.status);
    const identity = useQuery({
        queryKey: ["listing-identity", listing.id],
        queryFn: () => requestData<{ verified: boolean; status: string | null }>(`/api/listings/${listing.id}/identity`),
        enabled: !isCreate,
        refetchInterval: (query) => searchParams.has("verification") && query.state.dataUpdateCount < 20 &&
            (!query.state.data || ["INITIATED", "PENDING"].includes(query.state.data.status ?? "")) ? 3000 : false,
    });
    const verified = identity.data?.verified ?? listing.identityVerified;

    const save = useMutation({
        mutationFn: () => {
            const payload = {
                purpose: editor.purpose,
                propertyType: editor.propertyType,
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
                erfpachtType: editor.erfpachtType,
                erfpachtCanonCents: editor.erfpachtCanon
                    ? toCents(editor.erfpachtCanon)
                    : null,
                erfpachtDetails: editor.erfpachtDetails || null,
                erfpachtEndDate: editor.erfpachtEndDate
                    ? new Date(
                          `${editor.erfpachtEndDate}T00:00:00`,
                      ).toISOString()
                    : null,
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
                    questionnaireAnswers: editor.questionnaireAnswers,
                },
                garden: {
                    hasGarden: editor.hasGarden,
                    orientation: editor.hasGarden
                        ? editor.gardenOrientation || null
                        : null,
                },
            };

            if (isCreate) {
                const address = draft?.address;
                const property = draft?.property;
                return requestData<{ id: string }>("/api/listings", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        postcode:
                            address?.postcode ?? listing.property.postcode,
                        houseNumber: Number(
                            address?.houseNumber ??
                                listing.property.houseNumber,
                        ),
                        houseNumberAddition:
                            address?.addition ||
                            listing.property.houseNumberAddition,
                        street: address?.street ?? listing.property.street,
                        city: address?.city ?? listing.property.city,
                        municipality: property?.address.municipality ?? null,
                        province: property?.address.province ?? null,
                        bagAddressId: property?.bagAddressId ?? null,
                        bagBuildingId: property?.bagBuildingId ?? null,
                        cadastralParcelId: property?.cadastralParcelId ?? null,
                        latitude: property?.coordinates?.latitude ?? null,
                        longitude: property?.coordinates?.longitude ?? null,
                        energyLabel: property?.energy
                            ? {
                                  registrationNumber:
                                      property.energy.registrationNumber,
                                  labelClass: property.energy.labelClass,
                                  primaryFossilEnergyKwhSqmYear:
                                      property.energy
                                          .primaryFossilEnergyKwhSqmYear,
                                  registeredAt: property.energy.registeredAt,
                                  validUntil: property.energy.validUntil,
                              }
                            : null,
                        ...payload,
                    }),
                });
            }

            return requestData<ListingView>(`/api/listings/${listing.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ version: listing.version, ...payload }),
            });
        },
        onSuccess(data) {
            if (isCreate) {
                const id = (data as { id: string }).id;
                clearNewListingDraft();
                router.replace(`/dashboard/listings/${id}`);
                router.refresh();
                return;
            }
            setListing(data as ListingView);
            setNotice(t("Concept opgeslagen"));
        },
    });

    const aiWriter = useMutation({
        mutationFn: () =>
            requestData<{
                titleNl: string;
                descriptionNl: string;
                titleEn: string;
                descriptionEn: string;
            }>("/api/ai/listing-description", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    locale: "nl",
                    purpose: editor.purpose,
                    propertyType: editor.propertyType,
                    city: listing.property.city,
                    livingAreaSqm: Number(editor.livingAreaSqm),
                    roomCount: Number(editor.roomCount),
                    highlights: [],
                    existingTitleNl: editor.titleNl || undefined,
                    existingDescriptionNl: editor.descriptionNl || undefined,
                    existingTitleEn: editor.titleEn || undefined,
                    existingDescriptionEn: editor.descriptionEn || undefined,
                }),
            }),
        onSuccess(data) {
            setEditor((current) => ({
                ...current,
                titleNl: data.titleNl,
                descriptionNl: data.descriptionNl,
                titleEn: data.titleEn,
                descriptionEn: data.descriptionEn,
            }));
            setNotice(t("AI-voorstel gemaakt — controleer de tekst en sla op"));
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
            return requestData<EstimateResponse>("/api/estimates", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    postcode: listing.property.postcode,
                    houseNumber: listing.property.houseNumber,
                    addition: listing.property.houseNumberAddition ?? undefined,
                    wozValueCents: woz.amount ? Math.round(Number(woz.amount) * 100) : undefined,
                    wozAssessmentYear: woz.year ? Number(woz.year) : undefined,
                    propertyType: editor.propertyType,
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
            setListing(data.listing);
            if (data.ready) {
                setNotice(t("Advertentie is compleet en klaar voor identiteitsverificatie"));
            }
        },
    });

    const startIdentity = useMutation({
        retry: false,
        onMutate() { setVerificationError(null); },
        onError(error: Error) { setVerificationError(error.message); },
        mutationFn: () =>
            requestData<{
                alreadyVerified: boolean;
                redirectUrl: string | null;
            }>(`/api/listings/${listing.id}/identity/start`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ locale: "nl" }),
            }),
        onSuccess(data) {
            if (data.alreadyVerified) {
                setNotice(t("Je identiteit is al geverifieerd"));
                void queryClient.invalidateQueries({ queryKey: ["listing-identity", listing.id] });
                router.refresh();
            } else if (data.redirectUrl) {
                window.location.assign(data.redirectUrl);
            }
        },
    });

    const publish = useMutation({
        mutationFn: () =>
            requestData<{
                publications: Array<{ channel: string; status: string }>;
            }>(`/api/listings/${listing.id}/publish`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    idempotencyKey: crypto.randomUUID(),
                }),
            }),
        onSuccess() {
            setNotice(t("Publicatie is gestart"));
            router.refresh();
            window.location.reload();
        },
    });

    const bids = useQuery({
        queryKey: ["listing-bids", listing.id],
        queryFn: () =>
            requestData<Array<BidView>>(`/api/listings/${listing.id}/bids`),
        enabled:
            section === "bids" &&
            listing.status !== "DRAFT" &&
            (listing.biddingMethod === "OPEN" ||
                (listing.bidWindowClosesAt !== null &&
                    new Date(listing.bidWindowClosesAt) <= new Date())),
    });

    const address = `${listing.property.street} ${listing.property.houseNumber}${listing.property.houseNumberAddition ?? ""}`;

    return (
        <div>
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-brand">
                        <span>
                            {editor.purpose === "SALE" ? t("Verkoop") : t("Verhuur")}
                        </span>
                        <ChevronRight size={14} />
                        <span>{t(statusText(listing.status))}</span>
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
                        {isCreate ? t("Concept maken") : t("Concept opslaan")}
                    </button>
                ) : listing.publicSlug ? (
                    <a
                        href={`/property/${listing.publicSlug}`}
                        target="_blank"
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-semibold text-white"
                    >
                        {t("Bekijk advertentie")}<ChevronRight size={17} />
                    </a>
                ) : null}
            </div>

            {notice || save.error ? (
                <div
                    className={`mt-6 rounded-2xl px-5 py-4 text-sm ${save.error ? "bg-red-50 text-red-700" : "bg-brand/8 text-brand-dark"}`}
                >
                    {t(save.error?.message ?? notice)}
                </div>
            ) : null}

            {verificationError ? (
                <div role="alert" aria-live="assertive" className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 shadow-lg">
                    <CircleAlert size={20} className="shrink-0" />
                    <p>{t(verificationError)}</p>
                    <button type="button" aria-label={t("Melding sluiten")} onClick={() => setVerificationError(null)} className="ml-2 font-semibold">×</button>
                </div>
            ) : null}
            {searchParams.has("verification") ? (
                <p role="status" className="mt-6 rounded-2xl bg-brand/8 px-5 py-4 text-sm">
                    {verified ? t("Je identiteit is geverifieerd. Je kunt je woning gratis publiceren.")
                        : identity.data && ["FAILED", "EXPIRED", "CANCELLED"].includes(identity.data.status ?? "")
                          ? t("Je identiteit is niet geverifieerd. Start de controle opnieuw via Controleren & publiceren.")
                          : t("Je verificatie wordt verwerkt. Wacht even of vernieuw deze pagina om het resultaat te bekijken.")}
                </p>
            ) : null}

            <div className="mt-8 grid gap-7 lg:grid-cols-[250px_1fr]">
                <aside className="h-fit rounded-3xl border border-line bg-surface p-2 lg:sticky lg:top-24">
                    {sections.map((item) => {
                        const Icon = item.icon;
                        const locked = isCreate && item.id !== "details";
                        return (
                            <button
                                key={item.id}
                                type="button"
                                disabled={locked}
                                title={
                                    locked
                                        ? t("Sla eerst je concept op")
                                        : undefined
                                }
                                onClick={() => {
                                    if (locked) return;
                                    setSection(item.id);
                                    if (
                                        item.id === "publish" &&
                                        [
                                            "DRAFT",
                                            "READY_FOR_VERIFICATION",
                                        ].includes(listing.status) &&
                                        !validate.isPending
                                    ) {
                                        validate.mutate();
                                    }
                                }}
                                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${section === item.id ? "bg-brand text-white" : "hover:bg-background"} ${locked ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                                <Icon size={18} /> {t(item.label)}
                                {item.id === "messages" && messageUnread > 0 ? (
                                    <span
                                        className={`ml-auto grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${section === item.id ? "bg-surface text-brand" : "bg-brand text-white"}`}
                                    >
                                        {messageUnread}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                    {isCreate ? (
                        <p className="px-3 pt-3 text-xs leading-5 text-muted">
                            {t("Sla eerst je concept op om foto's, bezichtigingen en publicatie te openen.")}
                        </p>
                    ) : null}
                </aside>

                <section className="min-w-0 rounded-4xl border border-line bg-surface p-6 shadow-sm sm:p-9">
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
                    {section === "questionnaire" ? (
                        <QuestionnaireSection
                            propertyType={editor.propertyType}
                            answers={editor.questionnaireAnswers}
                            setAnswers={(questionnaireAnswers) =>
                                setEditor((current) => ({
                                    ...current,
                                    questionnaireAnswers,
                                }))
                            }
                            editable={editable}
                        />
                    ) : null}
                    {section === "estimate" ? (
                        <PriceAndBiddingSection
                            woz={woz}
                            setWoz={setWoz}
                            editor={editor}
                            setEditor={setEditor}
                            editable={editable}
                            estimate={estimate}
                        />
                    ) : null}
                    {section === "viewings" ? (
                        <ViewingPlanner
                            listingId={listing.id}
                            propertyType={editor.propertyType}
                            listingStatus={listing.status}
                        />
                    ) : null}
                    {section === "publish" ? (
                        <PublishSection
                            listing={listing}
                            verified={verified}
                            validate={validate}
                            startIdentity={startIdentity}
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
                    {section === "messages" && listing.id ? (
                        <div className="mx-auto max-w-2xl">
                            <OwnerListingMessages
                                listingId={listing.id}
                                onUnreadChange={() => setMessageUnread(0)}
                            />
                        </div>
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
    const { t } = useListingCopy();
    // Waarom is de AI-knop uitgeschakeld? Wordt als tooltip op de knop getoond.
    const aiDisabledReason = !editable
        ? t("De advertentie is niet meer aanpasbaar")
        : !editor.livingAreaSqm || !editor.roomCount
          ? t("Vul eerst het woonoppervlak en aantal kamers in")
          : null;
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
                title={t("Woninggegevens")}
                text={t("Vul de feiten zorgvuldig in. Deze gegevens worden gebruikt voor validatie, waardeschatting en publicatie.")}
            />
            <fieldset
                disabled={!editable}
                className="mt-8 grid gap-5 sm:grid-cols-2 disabled:opacity-70"
            >
                <label className="block text-sm font-semibold">
                    {t("Ik wil")}<select
                        value={editor.purpose}
                        onChange={set("purpose")}
                        className="input mt-2"
                    >
                        <option value="SALE">{t("Verkopen")}</option>
                        <option value="RENT">{t("Verhuren")}</option>
                    </select>
                </label>
                <label className="block text-sm font-semibold">
                    {t("Woningtype")}<select
                        value={editor.propertyType}
                        onChange={set("propertyType")}
                        className="input mt-2"
                    >
                        <option value="HOUSE">{t("Woonhuis")}</option>
                        <option value="APARTMENT">{t("Appartement")}</option>
                        <option value="PARKING">{t("Parkeerplaats")}</option>
                        <option value="LAND">{t("Grond")}</option>
                        <option value="COMMERCIAL">{t("Commercieel")}</option>
                        <option value="OTHER">{t("Overig")}</option>
                    </select>
                </label>
                <Input
                    label={t("Woonoppervlak (m²)")}
                    type="number"
                    value={editor.livingAreaSqm}
                    onChange={set("livingAreaSqm")}
                />
                <Input
                    label={t("Perceeloppervlak (m²)")}
                    type="number"
                    min="0"
                    step="0.1"
                    value={editor.officialLandAreaSqm}
                    onChange={set("officialLandAreaSqm")}
                />
                <Input
                    label={t("Externe bergruimte (m²)")}
                    type="number"
                    min="0"
                    max="10000"
                    step="0.1"
                    value={editor.externalStorageAreaSqm}
                    onChange={set("externalStorageAreaSqm")}
                />
                <Input
                    label={t("Aantal kamers")}
                    type="number"
                    value={editor.roomCount}
                    onChange={set("roomCount")}
                />
                <Input
                    label={t("Aantal slaapkamers")}
                    type="number"
                    value={editor.bedroomCount}
                    onChange={set("bedroomCount")}
                />
                <Input
                    label={t("Aantal badkamers")}
                    type="number"
                    min="0"
                    max="100"
                    value={editor.bathroomCount}
                    onChange={set("bathroomCount")}
                />
                <Input
                    label={t("Bouwjaar")}
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
                    {t("Monumentaal pand")}
                </label>
                <Input
                    label={t("Aantal woonlagen")}
                    type="number"
                    min="1"
                    max="100"
                    value={editor.floorCount}
                    onChange={set("floorCount")}
                />
                <label className="block text-sm font-semibold">
                    {t("Daktype")}<select
                        value={editor.roofType}
                        onChange={set("roofType")}
                        className="input mt-2"
                    >
                        <option value="">{t("Niet opgegeven")}</option>
                        {roofTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {t(option.label)}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="sm:col-span-2">
                    <OptionCheckboxes
                        title={t("Voorzieningen")}
                        options={propertyAmenityOptions}
                        values={editor.amenities}
                        onToggle={(value) => toggleOption("amenities", value)}
                    />
                </div>
                <div className="sm:col-span-2">
                    <OptionCheckboxes
                        title={t("Parkeren")}
                        options={parkingOptions}
                        values={editor.parkingOptions}
                        onToggle={(value) =>
                            toggleOption("parkingOptions", value)
                        }
                    />
                </div>
                {editor.parkingOptions.includes("SPACE_FOR_SALE") ? (
                    <Input
                        label={t("Prijs parkeerplaats apart te koop (€)")}
                        type="number"
                        min="0"
                        step="0.01"
                        value={editor.parkingSpacePrice}
                        onChange={set("parkingSpacePrice")}
                    />
                ) : null}
                <div className="sm:col-span-2 rounded-2xl border border-line p-5">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-dark">
                            <Flower2 size={18} />
                        </span>
                        <div>
                            <h3 className="font-semibold">{t("Tuin")}</h3>
                            <p className="mt-1 text-sm leading-6 text-muted">
                                {t("Geef aan of de woning een tuin heeft en waar deze op ligt. Zoekenden kunnen hierop filteren.")}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="flex items-center gap-3 self-end rounded-md border border-line px-4 py-3 text-sm font-semibold">
                            <input
                                type="checkbox"
                                checked={editor.hasGarden}
                                onChange={(event) =>
                                    setEditor((current) => ({
                                        ...current,
                                        hasGarden: event.target.checked,
                                        gardenOrientation: event.target.checked
                                            ? current.gardenOrientation
                                            : "",
                                    }))
                                }
                                className="size-4 accent-brand"
                            />
                            {t("De woning heeft een tuin")}
                        </label>
                        {editor.hasGarden ? (
                            <label className="block text-sm font-semibold">
                                {t("Tuinoriëntatie (optioneel)")}<select
                                    value={editor.gardenOrientation}
                                    onChange={set("gardenOrientation")}
                                    className="input mt-2"
                                >
                                    <option value="">{t("Niet opgegeven")}</option>
                                    {(
                                        Object.entries(
                                            gardenOrientationLabels,
                                        ) as Array<[GardenOrientation, string]>
                                    ).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {t(label)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                    </div>
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-line p-5">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-dark">
                            <Landmark size={18} />
                        </span>
                        <div>
                            <h3 className="font-semibold">{t("Erfpacht")}</h3>
                            <p className="mt-1 text-sm leading-6 text-muted">
                                {t("De grond onder de woning kan in erfpacht zijn. De jaarlijkse canon wordt naast de vraagprijs getoond. Is de canon eenmalig afgekocht, kies dan \"Erfpacht afgekocht\".")}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-semibold">
                            {t("Erfpachtsituatie")}<select
                                value={editor.erfpachtType}
                                onChange={set("erfpachtType")}
                                className="input mt-2"
                            >
                                {erfpachtOptions.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {t(option.label)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {editor.erfpachtType === "LEASEHOLD" ? (
                            <Input
                                label={t("Canon per jaar (€)")}
                                type="number"
                                min="0"
                                step="0.01"
                                value={editor.erfpachtCanon}
                                onChange={set("erfpachtCanon")}
                                placeholder={t("Bijv. 1200")}
                            />
                        ) : (
                            <div />
                        )}
                        {editor.erfpachtType === "LEASEHOLD" ||
                        editor.erfpachtType === "LEASEHOLD_AFGEKOCHT" ? (
                            <Input
                                label={t("Erfpacht loopt tot (optioneel)")}
                                type="date"
                                value={editor.erfpachtEndDate}
                                onChange={set("erfpachtEndDate")}
                            />
                        ) : null}
                        <label className="block text-sm font-semibold sm:col-span-2">
                            {t("Toelichting (optioneel)")}<textarea
                                value={editor.erfpachtDetails}
                                onChange={set("erfpachtDetails")}
                                rows={2}
                                maxLength={240}
                                placeholder={t("Bijv. canon wordt jaarlijks geïndexeerd, erfpacht wordt verlengd in 2035")}
                                className="input mt-2 min-h-16 py-3"
                            />
                        </label>
                    </div>
                </div>
            </fieldset>
            <EnergyLabelPanel
                listing={listing}
                setListing={setListing}
                editable={editable}
            />
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
                <div>
                    <h3 className="text-xl font-semibold">{t("Advertentietekst")}</h3>
                    <p className="mt-1 text-sm text-muted">
                        {t("Schrijf zelf of gebruik een feitelijk AI-voorstel.")}
                    </p>
                </div>
                <button
                    type="button"
                    disabled={Boolean(aiDisabledReason) || aiWriter.isPending}
                    title={
                        aiDisabledReason ??
                        (aiWriter.isPending
                            ? t("De AI schrijft een voorstel...")
                            : t("Genereert een voorstel voor titels en omschrijvingen (NL en EN)"))
                    }
                    onClick={() => aiWriter.mutate()}
                    className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {aiWriter.isPending ? (
                        <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                        <Bot size={17} />
                    )}{" "}
                    {t("Schrijf met AI")}
                </button>
            </div>
            {aiWriter.error ? (
                <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    {t(aiWriter.error.message)}
                </p>
            ) : null}
            <fieldset
                disabled={!editable}
                className="mt-6 space-y-5 disabled:opacity-70"
            >
                <Input
                    label={t("Nederlandse titel")}
                    value={editor.titleNl}
                    onChange={set("titleNl")}
                />
                <TextArea
                    label={t("Nederlandse omschrijving")}
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
                    label={t("Notities voor bezichtigingen")}
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
    const { t } = useListingCopy();
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
                        {t(option.label)}
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
    const { t } = useListingCopy();
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
                throw new Error(payload.error?.message ?? t("Upload mislukt"));
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
                    <h3 className="text-xl font-semibold">{t("Energielabel")}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">
                        {t("Bekijk het gevonden label en bewaar het officiële document bij je concept.")}
                    </p>
                </div>
            </div>

            {energy ? (
                <div className="mt-5 flex items-center gap-4 bg-emerald-50 p-5">
                    <span className="grid h-14 min-w-20 place-items-center bg-emerald-700 px-3 text-xl font-bold text-white">
                        {energyLabelNames[energy.labelClass] ??
                            energy.labelClass}
                    </span>
                    <div>
                        <p className="font-semibold">{t("Energielabel gevonden")}</p>
                        <p className="mt-1 text-sm text-emerald-800">
                            {documents.length
                                ? t("Het officiële PDF-document is toegevoegd.")
                                : t("Upload ook het officiële PDF-document — dit is verplicht om te publiceren.")}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="mt-5 flex items-start gap-3 bg-amber-50 p-5 text-amber-950">
                    <CircleAlert className="mt-0.5 shrink-0" size={19} />
                    <div>
                        <p className="font-semibold">
                            {t("Geen energielabel gevonden")}
                        </p>
                        <p className="mt-1 text-sm leading-6">
                            {t("Voeg het officiële PDF-document toe zodra je dit hebt ontvangen.")}
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
                {documents.length ? t("Nog een PDF toevoegen") : t("PDF toevoegen")}
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
                    {t(upload.error.message)}
                </p>
            ) : null}
        </section>
    );
}

const questionnaireAnswerOptions: Array<{
    value: QuestionnaireAnswerValue;
    label: string;
}> = [
    { value: "YES", label: "Ja" },
    { value: "NO", label: "Nee" },
    { value: "UNKNOWN", label: "Niet bekend" },
    { value: "NOT_APPLICABLE", label: "N.v.t." },
];

function QuestionnaireSection({
    propertyType,
    answers,
    setAnswers,
    editable,
}: {
    propertyType: ListingView["property"]["propertyType"];
    answers: QuestionnaireAnswer[];
    setAnswers: (answers: QuestionnaireAnswer[]) => void;
    editable: boolean;
}) {
    const { t } = useListingCopy();
    const questionnaireSections = getQuestionnaireSections(propertyType);
    const questionCount = questionnaireSections.reduce(
        (total, questionnaireSection) =>
            total + questionnaireSection.questions.length,
        0,
    );
    const applicableQuestionIds = new Set(
        questionnaireSections.flatMap((questionnaireSection) =>
            questionnaireSection.questions.map((question) => question.id),
        ),
    );
    const answeredCount = answers.filter((answer) =>
        applicableQuestionIds.has(answer.questionId),
    ).length;
    const completionPercentage = Math.round(
        (answeredCount / questionCount) * 100,
    );
    const updateAnswer = (
        questionId: string,
        answer: QuestionnaireAnswerValue,
    ) => {
        const existing = answers.find(
            (current) => current.questionId === questionId,
        );
        setAnswers(
            existing
                ? answers.map((current) =>
                      current.questionId === questionId
                          ? { ...current, answer }
                          : current,
                  )
                : [...answers, { questionId, answer, details: "" }],
        );
    };
    const updateDetails = (questionId: string, details: string) =>
        setAnswers(
            answers.map((answer) =>
                answer.questionId === questionId
                    ? { ...answer, details }
                    : answer,
            ),
        );

    return (
        <div>
            <SectionHeading
                icon={ClipboardList}
                title={t("Vragenlijst over de woning")}
                text={t("Deel wat u weet over de juridische en technische staat van de woning. De antwoorden zijn informatief en helpen kopers om zich goed voor te bereiden. Licht bijzonderheden zo concreet mogelijk toe.")}
            />
            <div className="mt-7 border-y border-line py-4">
                <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-semibold">{t("Voortgang")}</span>
                    <span className="text-muted">
                        {answeredCount} {t("van")}{" "}{" "}{questionCount} {t("beantwoord")}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                    <div
                        className="h-full rounded-full bg-brand transition-[width]"
                        style={{ width: `${completionPercentage}%` }}
                    />
                </div>
            </div>

            <div className="mt-6 divide-y divide-line border-y border-line">
                {questionnaireSections.map(
                    (questionnaireSection, sectionIndex) => {
                        const sectionAnswerCount =
                            questionnaireSection.questions.filter((question) =>
                                answers.some(
                                    (answer) =>
                                        answer.questionId === question.id,
                                ),
                            ).length;
                        return (
                            <details
                                key={questionnaireSection.id}
                                className="group"
                                open={sectionIndex === 0 ? true : undefined}
                            >
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5">
                                    <div>
                                        <h3 className="font-semibold">
                                            {t(questionnaireSection.title)}
                                        </h3>
                                        <p className="mt-1 text-sm leading-6 text-muted">
                                            {t(questionnaireSection.description)}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold text-muted">
                                        {sectionAnswerCount}/
                                        {questionnaireSection.questions.length}
                                    </span>
                                </summary>
                                <fieldset
                                    disabled={!editable}
                                    className="border-t border-line disabled:opacity-70"
                                >
                                    {questionnaireSection.questions.map(
                                        (question, questionIndex) => {
                                            const currentAnswer = answers.find(
                                                (answer) =>
                                                    answer.questionId ===
                                                    question.id,
                                            );
                                            return (
                                                <div
                                                    key={question.id}
                                                    className={`py-6 ${questionIndex ? "border-t border-line" : ""}`}
                                                >
                                                    <p className="max-w-3xl font-semibold leading-6">
                                                        {t(question.text)}
                                                    </p>
                                                    {question.hint ? (
                                                        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
                                                            {t(question.hint)}
                                                        </p>
                                                    ) : null}
                                                    <div className="mt-4 flex flex-wrap gap-2">
                                                        {questionnaireAnswerOptions.map(
                                                            (option) => (
                                                                <button
                                                                    key={
                                                                        option.value
                                                                    }
                                                                    type="button"
                                                                    aria-pressed={
                                                                        currentAnswer?.answer ===
                                                                        option.value
                                                                    }
                                                                    onClick={() =>
                                                                        updateAnswer(
                                                                            question.id,
                                                                            option.value,
                                                                        )
                                                                    }
                                                                    className={`min-h-10 border px-4 text-sm font-semibold ${currentAnswer?.answer === option.value ? "border-brand bg-brand text-white" : "border-line bg-surface text-brand-dark"}`}
                                                                >
                                                                    {
                                                                        t(option.label)
                                                                    }
                                                                </button>
                                                            ),
                                                        )}
                                                    </div>
                                                    {currentAnswer ? (
                                                        <label className="mt-4 block max-w-3xl text-sm font-semibold">
                                                            {t("Toelichting (optioneel)")}<textarea
                                                                value={
                                                                    currentAnswer.details
                                                                }
                                                                maxLength={
                                                                    1_000
                                                                }
                                                                rows={3}
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    updateDetails(
                                                                        question.id,
                                                                        event
                                                                            .target
                                                                            .value,
                                                                    )
                                                                }
                                                                placeholder={t("Beschrijf wat er speelt, waar dit zich bevindt en wat er eventueel al aan is gedaan.")}
                                                                className="input mt-2 py-3"
                                                            />
                                                        </label>
                                                    ) : null}
                                                </div>
                                            );
                                        },
                                    )}
                                </fieldset>
                            </details>
                        );
                    },
                )}
            </div>
            <p className="mt-5 text-sm leading-6 text-muted">
                {t("Sla het concept op om uw antwoorden te bewaren. Twijfelt u over een antwoord, kies dan \"Niet bekend\" en voeg waar nodig een toelichting toe.")}
            </p>
        </div>
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
    const { t } = useListingCopy();
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
                throw new Error(payload.error?.message ?? t("Upload mislukt"));
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
            if (!response.ok) throw new Error(t("Verwijderen mislukt"));
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
                title={t("Lijst van zaken")}
                text={t("Leg vast welke roerende zaken achterblijven, meegaan of ter overname worden aangeboden. Kopers kunnen de lijst van zaken en vragenlijst als PDF downloaden.")}
            />
            <div className="mt-7 inline-flex border border-line p-1">
                <button
                    type="button"
                    onClick={() => setMode("create")}
                    className={`px-4 py-2 text-sm font-semibold ${mode === "create" ? "bg-brand text-white" : "text-muted"}`}
                >
                    {t("Zelf maken")}
                </button>
                <button
                    type="button"
                    onClick={() => setMode("upload")}
                    className={`px-4 py-2 text-sm font-semibold ${mode === "upload" ? "bg-brand text-white" : "text-muted"}`}
                >
                    {t("PDF uploaden")}
                </button>
            </div>

            {mode === "create" ? (
                <div className="mt-7">
                    <div className="border border-line bg-background p-5">
                        <h3 className="font-semibold">{t("Veelvoorkomende zaken")}</h3>
                        <p className="mt-1 text-sm text-muted">
                            {t("Voeg relevante voorbeelden toe en pas ze daarna aan.")}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {movableItemSuggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    disabled={
                                        !editable ||
                                        items.some(
                                            (item) => item.name === suggestion || item.name === t(suggestion),
                                        )
                                    }
                                    onClick={() => addItem(t(suggestion))}
                                    className="inline-flex items-center gap-1.5 border border-line bg-surface px-3 py-2 text-sm font-semibold disabled:opacity-40"
                                >
                                    <Plus size={15} /> {t(suggestion)}
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
                                    label={t("Zaak")}
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
                                    {t("Categorie")}<select
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
                                                    {t(category.label)}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </label>
                                <Input
                                    label={t("Toelichting (optioneel)")}
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
                                    title={t("Zaak verwijderen")}
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
                        <Plus size={16} /> {t("Eigen zaak toevoegen")}</button>
                    {items.length ? (
                        <p className="mt-4 text-sm text-muted">
                            {t("Sla het concept op om de downloadbare PDF bij te werken.")}
                        </p>
                    ) : null}
                </div>
            ) : (
                <div className="mt-7">
                    <p className="text-sm leading-6 text-muted">
                        {t("Upload een bestaande roerende-zakenlijst als PDF van maximaal 20 MB.")}
                    </p>
                    <label className="mt-4 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white">
                        {upload.isPending ? (
                            <LoaderCircle className="animate-spin" size={16} />
                        ) : (
                            <FileUp size={16} />
                        )}
                        {t("PDF kiezen")}<input
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
                                    title={t("PDF verwijderen")}
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
    const { t } = useListingCopy();
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
                    throw new Error(payload.error?.message ?? t("Upload mislukt"));
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
            if (!response.ok) throw new Error(t("Verwijderen mislukt"));
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
                title={t("Foto's & plattegronden")}
                text={t("Voeg woningfoto's en plattegronden afzonderlijk toe. Per bestand geldt een maximum van 20 MB.")}
            />
            <section className="mt-8">
                <h3 className="text-xl font-semibold">{t("Woningfoto's")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                    {t("Selecteer meerdere JPG-, PNG- of WebP-foto's tegelijk.")}
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white">
                    {upload.isPending ? (
                        <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                        <ImagePlus size={17} />
                    )}{" "}
                    {t("Woningfoto's kiezen")}
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
                    label={t("Foto")}
                />
            </section>
            {upload.error ? (
                <p className="mt-4 text-sm text-red-700">
                    {t(upload.error.message)}
                </p>
            ) : null}
            <section className="mt-9 border-t border-line pt-7">
                <h3 className="text-xl font-semibold">{t("Plattegronden")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                    {t("Upload meerdere afbeeldingen of PDF-bestanden, of voeg een interactieve Floorplanner-link toe.")}
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-5 py-3 text-sm font-semibold text-brand">
                    {upload.isPending ? (
                        <LoaderCircle className="animate-spin" size={17} />
                    ) : (
                        <FileUp size={17} />
                    )}{" "}
                    {t("Plattegronden kiezen")}<input
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
                    label={t("Plattegrond")}
                />
                <div className="mt-7 border-t border-line pt-6">
                    <Input
                        label={t("Floorplanner embed-URL")}
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
                        {t("Gebruik de Viewer- of Spaceplanner-link van een openbaar Level 3-project. De interactieve plattegrond wordt na opslaan aan de advertentie gekoppeld.")}{" "}{" "}
                        <a
                            href="https://floorplanner.readme.io/reference/viewer-spaceplanner"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-brand underline underline-offset-2"
                        >
                            {t("Zo vind je de embed-URL")}<ExternalLink size={12} />
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
    const { t } = useListingCopy();
    if (!media.length) return null;

    return (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {media.map((item) => (
                <article
                    key={item.id}
                    className="group relative overflow-hidden rounded-2xl border border-line bg-background"
                >
                    {item.mimeType.startsWith("image/") ? (
                        <ListingImage
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
                        <p className="mt-1 text-[11px] text-muted">{t(label)}</p>
                    </div>
                    {editable ? (
                        <button
                            type="button"
                            onClick={() => remove(item.id)}
                        aria-label={`${t("Verwijderen")}: ${item.fileName}`}
                            className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-surface text-red-700 shadow"
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
        text: "Biedingen blijven voor jou en andere bieders verborgen tot de ingestelde sluitingstijd.",
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
    woz,
    setWoz,
    editor,
    setEditor,
    editable,
    estimate,
}: {
    woz: { amount: string; year: string };
    setWoz: React.Dispatch<React.SetStateAction<{ amount: string; year: string }>>;
    editor: EditorState;
    setEditor: React.Dispatch<React.SetStateAction<EditorState>>;
    editable: boolean;
    estimate: {
        mutate: () => void;
        isPending: boolean;
        data?: EstimateResponse;
        error: Error | null;
    };
}) {
    const { t, locale } = useListingCopy();
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
                title={t("Prijs & bieden")}
                text={t("Bepaal de prijsstrategie en leg vast hoe, wanneer en onder welke voorwaarden geïnteresseerden kunnen bieden.")}
            />
            <fieldset
                disabled={!editable}
                className="mt-9 space-y-9 disabled:opacity-70"
            >
                <div>
                    <h3 className="text-lg font-semibold">{t("Prijsstelling")}</h3>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                        <Input
                            label={
                                editor.purpose === "SALE"
                                    ? t("Vraagprijs (€)")
                                    : t("Huurprijs per maand (€)")
                            }
                            type="number"
                            min="1"
                            step="1"
                            value={
                                editor.purpose === "SALE"
                                    ? editor.askingPrice
                                    : editor.monthlyRent
                            }
                            onChange={set(
                                editor.purpose === "SALE"
                                    ? "askingPrice"
                                    : "monthlyRent",
                            )}
                        />
                        {editor.purpose === "RENT" ? (
                            <Input
                                label={t("Servicekosten per maand (€)")}
                                type="number"
                                min="0"
                                step="0.01"
                                value={editor.serviceCosts}
                                onChange={set("serviceCosts")}
                            />
                        ) : (
                            <div>
                                <Input
                                    label={t("Minimaal bod (€)")}
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={editor.minimumBid}
                                    onChange={set("minimumBid")}
                                />
                                <p className="mt-2 text-xs leading-5 text-muted">
                                    {t("Dit bedrag is niet zichtbaar op de advertentie.")}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-line pt-8">
                    <h3 className="text-lg font-semibold">{t("Manier van bieden")}</h3>
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
                                        {t(method.title)}
                                    </span>
                                </span>
                                <span className="mt-3 block text-xs leading-5 text-muted">
                                    {t(method.text)}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="grid gap-5 border-t border-line pt-8 sm:grid-cols-2">
                    <Input
                        label={t("Bieden mogelijk vanaf")}
                        type="datetime-local"
                        value={editor.bidWindowOpensAt}
                        onChange={set("bidWindowOpensAt")}
                    />
                    <Input
                        label={
                            editor.biddingMethod === "SEALED"
                                ? t("Inschrijving sluit")
                                : t("Bieden mogelijk tot")
                        }
                        type="datetime-local"
                        value={editor.bidWindowClosesAt}
                        onChange={set("bidWindowClosesAt")}
                    />
                    {editor.biddingMethod === "OPEN" ? (
                        <Input
                            label={t("Minimale biedstap (€)")}
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
                        {t("Biedingen met voorwaarden toestaan")}
                    </label>
                </div>
            </fieldset>

            <div className="mt-10 border-t border-line pt-8">
                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                    <Input label={t("WOZ-waarde (€, optioneel)")} type="number" min="10000"
                        value={woz.amount} onChange={(event) => setWoz((current) => ({ ...current, amount: event.target.value }))} />
                    <Input label={t("WOZ-beschikkingsjaar (bijv. 2026)")} type="number" min="2000" max={new Date().getFullYear()}
                        value={woz.year} onChange={(event) => setWoz((current) => ({ ...current, year: event.target.value }))} />
                </div>
                <p className="mb-5 text-sm text-muted">{t("Gebruik het jaar op de beschikking; de waardepeildatum ligt één jaar eerder. De WOZ-waarde wordt gebruikt als voldoende lokale verkopen ontbreken.")}</p>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className="flex items-center gap-2 text-lg font-semibold">
                            <Sparkles size={18} className="text-brand" />
                            {t("Waardeschatting")}</h3>
                        <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                            {t("Gebruik woningkenmerken en foto's voor een indicatieve marktwaarde en bandbreedte.")}
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
                        {t("Bereken indicatie")}
                    </button>
                </div>
            </div>
            {estimate.error ? (
                <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    {t(estimate.error.message)}
                </p>
            ) : null}
            {value ? (
                <div className="mt-8 overflow-hidden rounded-3xl bg-brand-dark p-7 text-white sm:p-9">
                    <p className="text-sm font-semibold uppercase tracking-wider text-accent">
                        {t("Geschatte marktwaarde")}
                    </p>
                    <p className="mt-3 text-4xl font-semibold">
                        {money(value.estimatedValueCents, locale)}
                    </p>
                    <p className="mt-3 text-white/65">
                        {t("Bandbreedte")}{" "}{" "}{money(value.lowerBoundCents, locale)} –{" "}
                        {money(value.upperBoundCents, locale)}
                    </p>
                    <div className="mt-7 grid gap-3 sm:grid-cols-3">
                        <Stat label={t("Methode")} value={value.method === "COMPARABLE_SALES" ? t("Vergelijkbare verkopen") : value.method === "PROPERTY_WOZ" ? t("Eigen WOZ-waarde") : t("Gemeentelijke WOZ")} />
                        <Stat
                            label={t("Onderbouwing")}
                            value={value.method === "COMPARABLE_SALES" ? `${value.comparableCount} ${t("verkopen")}` : t("Beperkt; statistische indicatie")}
                        />
                        <Stat
                            label={t("Resultaat")}
                            value={value.cached ? t("Uit cache") : t("Nieuw")}
                        />
                    </div>
                    <p className="mt-4 text-sm text-white/70">{t("Prijsniveau:")}{" "}{" "}{value.valuationMonth}{value.referenceMonth ? ` · ${t("WOZ-peildatum")}: ${value.referenceMonth}` : ""}</p>
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-white/70">
                        {value.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                    <a href={value.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm underline">{t("Brongegevens")}</a>
                    {value.askingSourceUrl ? <a href={value.askingSourceUrl} target="_blank" rel="noreferrer" className="ml-4 text-sm underline">{t("Vraagprijscontrole: Residentievinder")}</a> : null}
                    <p className="mt-6 text-xs leading-5 text-white/55">
                        {t("Dit is een geautomatiseerde indicatie, geen taxatierapport of financieel advies.")}
                    </p>
                </div>
            ) : null}
        </div>
    );
}

function PublishSection({
    listing,
    verified,
    validate,
    startIdentity,
    publish,
}: {
    listing: ListingView;
    verified: boolean;
    validate: {
        mutate: () => void;
        isPending: boolean;
        data?: {
            ready: boolean;
            issues: Array<{ field: string; message: string }>;
        };
        error: Error | null;
    };
    startIdentity: { mutate: () => void; isPending: boolean; error: Error | null };
    publish: {
        mutate: () => void;
        isPending: boolean;
        error: Error | null;
    };
}) {
    const { t, language } = useListingCopy();
    const ready = ["READY_FOR_VERIFICATION", "LIVE"].includes(listing.status);
    return (
        <div>
            <SectionHeading
                icon={Send}
                title={t("Controleren & publiceren")}
                text={t("Publiceer je woning gratis op ZelfWonen na e-mail- en identiteitsverificatie.")}
            />
            <div className="mt-8 space-y-3">
                <GateRow
                    done={ready}
                    icon={Check}
                    title={t("Advertentie compleet")}
                    text={
                        validate.isPending
                            ? t("Advertentie wordt gecontroleerd...")
                            : t("Verplichte velden en minimaal vijf foto's")
                    }
                />
                <GateRow
                    done={verified}
                    icon={Fingerprint}
                    title={t("Identiteit via Didit")}
                    text={t("Verifieer je identiteit met je identiteitsbewijs en een selfie om te publiceren.")}
                    action={
                        ready && !verified ? (
                            <button
                                onClick={() => startIdentity.mutate()}
                                disabled={startIdentity.isPending}
                                className="action-button"
                            >
                                {t("Start verificatie")}
                            </button>
                        ) : null
                    }
                />
            </div>
            {!validate.isPending && validate.data && !validate.data.ready ? (
                <div className="mt-5 rounded-2xl bg-amber-50 p-5">
                    <p className="font-semibold text-amber-900">
                        {t("Vul minimaal het volgende aan")}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                        {validate.data.issues.map((issue) => (
                            <li key={`${issue.field}-${issue.message}`}>
                                {translateListingIssue(language, issue.message)}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {[
                validate.error,
                startIdentity.error,
                publish.error,
            ].find(Boolean) ? (
                <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    {
                        [
                            validate.error,
                            startIdentity.error,
                            publish.error,
                        ].find(Boolean)?.message
                    }
                </p>
            ) : null}
            <div className="mt-7 flex flex-wrap gap-3">
                {listing.status !== "LIVE" ? (
                    <button
                        type="button"
                        disabled={!ready || !verified || publish.isPending}
                        onClick={() => publish.mutate()}
                        className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-brand-dark disabled:opacity-40"
                    >
                        <Send size={17} /> {t("Gratis publiceren")}</button>
                ) : null}
            </div>
            {listing.publications.length > 0 ? (
                <div className="mt-8 border-t border-line pt-6">
                    <h3 className="font-semibold">{t("Publicatiestatus")}</h3>
                    <div className="mt-3 space-y-2">
                        {listing.publications.filter((item) => item.channel === "PLATFORM").map((item) => (
                            <div
                                key={item.id}
                                className="flex justify-between rounded-xl bg-background px-4 py-3 text-sm"
                            >
                                <span>ZelfWonen</span>
                                <strong>{item.status}</strong>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

type ResolutiveConditions = {
    financing?: boolean;
    financingAmountCents?: string | null;
    buildingInspection?: boolean;
    inspectionLimitCents?: string | null;
    saleOfCurrentHome?: boolean;
    additionalConditions?: string[];
};

type BidView = {
    id: string;
    bidderPseudonym: string;
    amountCents: string;
    submittedAt: string;
    resolutiveConditions: ResolutiveConditions | null;
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
    const { t, locale } = useListingCopy();
    const router = useRouter();
    const [showNtaInfo, setShowNtaInfo] = useState(false);
    const confidential =
        listing.biddingMethod !== "OPEN" &&
        (listing.bidWindowClosesAt === null ||
            new Date(listing.bidWindowClosesAt) > new Date());
    const decision = useMutation({
        mutationFn: ({
            bidId,
            value,
        }: {
            bidId: string;
            value: "ACCEPTED" | "REJECTED";
        }) =>
            requestData<{ transactionId?: string }>(
                `/api/listings/${listing.id}/bids/${bidId}`,
                {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ decision: value }),
                },
            ),
        onSuccess: (result) => {
            onDecision();
            if (result.transactionId) {
                router.push(`/dashboard/transactions/${result.transactionId}`);
            }
        },
    });
    return (
        <div>
            <SectionHeading
                icon={ShieldCheck}
                title={t("Onveranderbaar biedlogboek")}
                text={
                    confidential
                        ? t("Tijdens deze biedingsronde zijn bedragen, voorwaarden en bieders ook voor jou verborgen. Na de sluiting kun je de biedingen vergelijken.")
                        : t("Alle biedingen staan chronologisch met bedrag, tijdstip en ontbindende voorwaarden. Identiteiten zijn gepseudonimiseerd.")
                }
            />
            {confidential ? (
                <div className="mt-8 border border-line bg-background p-6 text-muted">
                    <div className="flex items-start gap-2">
                        <p>
                            {t("Biedingen worden beschikbaar na de sluiting")}{" "}{" "}{listing.bidWindowClosesAt
                                ? ` ${t("op")} ${new Date(listing.bidWindowClosesAt).toLocaleString(locale)}`
                                : " van de biedingsronde"}
                            .
                        </p>
                        <button
                            type="button"
                            aria-label={t("Meer informatie over NTA 8061 en eerlijk bieden")}
                            aria-expanded={showNtaInfo}
                            aria-controls="nta-8061-bidding-info"
                            onClick={() =>
                                setShowNtaInfo((current) => !current)
                            }
                            className="grid size-7 shrink-0 place-items-center text-brand"
                            title={t("NTA 8061 en eerlijk bieden")}
                        >
                            <Info size={17} />
                        </button>
                    </div>
                    {showNtaInfo ? (
                        <p
                            id="nta-8061-bidding-info"
                            className="mt-3 border-t border-line pt-3 text-sm leading-6"
                        >
                            {t("Deze werkwijze volgt NTA 8061: biedingen die voor kandidaat-kopers verborgen zijn, blijven tot de sluiting ook verborgen voor de verkoper. Zo krijgt iedere bieder een eerlijke kans.")}
                        </p>
                    ) : null}
                </div>
            ) : loading ? (
                <LoaderCircle className="mt-8 animate-spin text-brand" />
            ) : bids.length === 0 ? (
                <p className="mt-8 rounded-2xl bg-background p-6 text-muted">
                    {t("Er zijn nog geen biedingen ontvangen.")}
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
                                            {money(bid.amountCents, locale)}
                                        </h3>
                                        <p className="mt-1 text-sm text-muted">
                                            {bid.bidderPseudonym} ·{" "}
                                            {new Date(
                                                bid.submittedAt,
                                            ).toLocaleString(locale)}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">
                                        {bid.events.at(-1)?.type ?? "SUBMITTED"}
                                    </span>
                                </div>
                                <ConditionsPanel
                                    conditions={bid.resolutiveConditions}
                                />
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
                                            {t("Accepteren")}
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
                                            {t("Afwijzen")}
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
                    <ShieldCheck size={17} /> {t("Download biedlogboek (PDF)")}</a>
            ) : null}
        </div>
    );
}

function ConditionsPanel({
    conditions,
}: {
    conditions: ResolutiveConditions | null;
}) {
    const { t, locale } = useListingCopy();
    const hasConditions = Boolean(
        conditions &&
        (conditions.financing ||
            conditions.buildingInspection ||
            conditions.saleOfCurrentHome ||
            (conditions.additionalConditions?.length ?? 0) > 0),
    );

    if (!hasConditions) {
        return (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                <Check size={16} />
                {t("Onvoorwaardelijk bod")}
            </div>
        );
    }

    return (
        <div className="mt-4 rounded-xl border border-line bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("Ontbindende voorwaarden")}
            </p>
            <ul className="mt-3 space-y-2.5 text-sm">
                {conditions?.financing ? (
                    <li className="flex items-baseline justify-between gap-4">
                        <span>{t("Onder voorbehoud van financiering")}</span>
                        {conditions.financingAmountCents ? (
                            <span className="shrink-0 font-semibold">
                                {money(conditions.financingAmountCents, locale)}
                            </span>
                        ) : null}
                    </li>
                ) : null}
                {conditions?.buildingInspection ? (
                    <li className="flex items-baseline justify-between gap-4">
                        <span>{t("Onder voorbehoud van bouwkundige keuring")}</span>
                        {conditions.inspectionLimitCents ? (
                            <span className="shrink-0 font-semibold">
                                Budget {money(conditions.inspectionLimitCents, locale)}
                            </span>
                        ) : null}
                    </li>
                ) : null}
                {conditions?.saleOfCurrentHome ? (
                    <li>{t("Onder voorbehoud van verkoop huidige woning")}</li>
                ) : null}
                {conditions?.additionalConditions?.length ? (
                    <li>
                        <span className="font-semibold">
                            {t("Aanvullende voorwaarden")}
                        </span>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                            {conditions.additionalConditions.map(
                                (text, conditionIndex) => (
                                    <li key={conditionIndex}>{text}</li>
                                ),
                            )}
                        </ul>
                    </li>
                ) : null}
            </ul>
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
function money(cents: string, locale: string) {
    return new Intl.NumberFormat(locale, {
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
