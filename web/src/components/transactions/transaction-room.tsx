"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle,
    ArrowLeft,
    Banknote,
    Building2,
    Check,
    CheckCircle2,
    ChevronRight,
    Circle,
    Clock3,
    Download,
    FileCheck2,
    FileText,
    Handshake,
    KeyRound,
    Landmark,
    LoaderCircle,
    MessageSquare,
    Minus,
    Paperclip,
    Save,
    Send,
    ShieldCheck,
    Upload,
    X,
} from "lucide-react";
import {
    Koopovereenkomst,
    type Agreement,
} from "@/components/transactions/koopovereenkomst";
import { SecurityDeposit } from "@/components/transactions/security-deposit";

type Milestone = {
    id: string;
    type: string;
    title: string;
    status: string;
    dueAt: string | null;
    completedAt: string | null;
};
type DocumentItem = {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: string;
    category: string;
    sha256: string;
    createdAt: string;
    uploadedBy: { id: string; name: string };
};
type Message = {
    id: string;
    authorUserId: string;
    kind: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string };
    documents: DocumentItem[];
};
type Person = { id: string; name: string; email: string };
type Room = {
    id: string;
    listingId: string;
    sellerUserId: string;
    buyerUserId: string;
    status: string;
    purchasePriceCents: string;
    targetTransferDate: string | null;
    contractTerms: Record<string, unknown> | null;
    buyerContractConfirmedAt: string | null;
    sellerContractConfirmedAt: string | null;
    coolingOffEndsAt: string | null;
    notaryProposal: Record<string, string> | null;
    notaryProposedByUserId: string | null;
    notaryProposedAt: string | null;
    notaryDetails: Record<string, string> | null;
    notaryConfirmedByUserId: string | null;
    notaryConfirmedAt: string | null;
    handoverDetails: Record<string, string | number> | null;
    completedAt: string | null;
    securityReference: string | null;
    securityPaidAt: string | null;
    securityPaidBy: { name: string } | null;
    securityConfirmedAt: string | null;
    securityConfirmedBy: { name: string } | null;
    securityForm: "DEPOSIT" | "BANK_GUARANTEE" | null;
    securityFormChosenAt: string | null;
    securityFormChosenBy: { name: string } | null;
    listing: {
        publicSlug: string | null;
        purpose: string;
        property: {
            propertyType: string;
            street: string;
            houseNumber: number;
            houseNumberAddition: string | null;
            postcode: string;
            city: string;
            livingAreaSqm: string | null;
            roomCount: number | null;
            constructionYear: number | null;
            energyLabels: Array<{ labelClass: string }>;
        };
    };
    acceptedBid: {
        resolutiveConditions: Record<string, unknown>;
        financingDeadline: string | null;
        transferDateRequested: string | null;
    };
    seller: Person;
    buyer: Person;
    milestones: Milestone[];
    messages: Message[];
    documents: DocumentItem[];
    agreement: Agreement | null;
};
type PassportVersion = {
    id: string;
    version: number;
    completenessScore: number;
    entryHash: string;
    previousHash: string | null;
    createdAt: string;
    snapshot: { changeNote?: string; trigger?: string };
};
type PassportItem = {
    key: string;
    label: string;
    description: string;
    status: "SATISFIED" | "MISSING" | "NOT_APPLICABLE";
    weight: number;
    actionHint: string;
    category?: string;
    draftKey?: string;
};
type PassportCompleteness = {
    score: number;
    satisfied: number;
    applicable: number;
    total: number;
    items: PassportItem[];
};
type PassportDraftStatus = {
    completeness: PassportCompleteness;
    editableFields: Record<string, unknown>;
    documents: Array<{
        id: string;
        category: string;
        fileName: string;
        sha256: string;
        uploadedByName: string | null;
    }>;
    latestVersion: number | null;
    latestEntryHash: string | null;
    hasChangesSinceLatest: boolean;
};
type PassportData = {
    versions: PassportVersion[];
    draft: PassportDraftStatus;
};

const tabs = [
    ["overview", "Voortgang", CheckCircle2],
    ["passport", "Woningpaspoort", ShieldCheck],
    ["contract", "Contract", FileCheck2],
    ["security", "Waarborgsom", Banknote],
    ["notary", "Notaris", Landmark],
    ["handover", "Oplevering", KeyRound],
    ["documents", "Documenten", FileText],
    ["chat", "Chat", MessageSquare],
] as const;
const statusNames: Record<string, string> = {
    ACTIVE: "Actief",
    CONTRACT_PENDING: "Contract voorbereiden",
    CONDITIONS_PENDING: "Voorwaarden afronden",
    READY_FOR_TRANSFER: "Klaar voor overdracht",
    COMPLETED: "Afgerond",
    CANCELLED: "Geannuleerd",
};
const documentNames: Record<string, string> = {
    CHAT_ATTACHMENT: "Chatbijlage",
    PURCHASE_AGREEMENT: "Koopovereenkomst",
    PROPERTY_PASSPORT: "Woningpaspoort",
    FINANCING: "Financiering",
    BUILDING_INSPECTION: "Bouwkundige keuring",
    SECURITY_DEPOSIT: "Waarborgsom / borg",
    NOTARY: "Notaris",
    FINAL_INSPECTION: "Eindinspectie",
    ENERGY_LABEL: "Energielabel",
    FLOOR_PLAN: "Plattegrond",
    VVE: "VvE-stukken",
    CADASTRAL: "Kadastrale gegevens",
    OTHER: "Overig",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(payload.error?.message ?? "De actie is mislukt");
    return payload.data as T;
}

export function TransactionRoom({
    initialRoom,
    currentUserId,
    signNotice,
}: {
    initialRoom: Room;
    currentUserId: string;
    signNotice?: string;
}) {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<(typeof tabs)[number][0]>("overview");
    const roomQuery = useQuery({
        queryKey: ["transaction", initialRoom.id],
        queryFn: () => api<Room>(`/api/transactions/${initialRoom.id}`),
        initialData: initialRoom,
        refetchInterval: 5000,
    });
    const passportQuery = useQuery({
        queryKey: ["transaction-passport", initialRoom.id],
        queryFn: () =>
            api<PassportData>(`/api/transactions/${initialRoom.id}/passport`),
    });
    const room = roomQuery.data;
    const isSeller = room.sellerUserId === currentUserId;
    const closed = room.status === "COMPLETED" || room.status === "CANCELLED";
    const isSale = room.listing.purpose === "SALE";
    const contractTabLabel = isSale ? "Koopovereenkomst" : "Contract";
    const refresh = async () => {
        await Promise.all([
            queryClient.invalidateQueries({
                queryKey: ["transaction", room.id],
            }),
            queryClient.invalidateQueries({
                queryKey: ["transaction-passport", room.id],
            }),
        ]);
    };
    const completed = room.milestones.filter(
        (item) =>
            item.status === "COMPLETED" ||
            item.status === "WAIVED" ||
            effectiveStatus(room, item) === "COMPLETED",
    ).length;
    const progress = Math.round((completed / room.milestones.length) * 100);
    return (
        <div className="-mx-1 pb-20">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <Link
                        href="/dashboard/transactions"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
                    >
                        <ArrowLeft size={16} /> Alle transacties
                    </Link>
                    <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">
                        {room.listing.property.street}{" "}
                        {room.listing.property.houseNumber}
                        {room.listing.property.houseNumberAddition}
                    </h1>
                    <p className="mt-1 text-sm text-muted">
                        Je bent {isSeller ? "verkoper" : "koper"} · met{" "}
                        {isSeller ? room.buyer.name : room.seller.name}
                    </p>
                </div>
                <div className="flex items-center gap-3 border border-line bg-surface px-4 py-3">
                    <ShieldCheck className="text-brand" size={20} />
                    <div>
                        <p className="text-xs text-muted">Beveiligde ruimte</p>
                        <p className="text-sm font-semibold">
                            {statusNames[room.status]}
                        </p>
                    </div>
                </div>
            </div>
            <div className="mt-6 grid gap-4 bg-brand-dark p-5 text-white md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                    <p className="text-xs font-semibold uppercase text-accent">
                        Voortgang overdracht
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
                        <div
                            className="h-full bg-accent"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="mt-2 text-xs text-white/70">
                        {completed} van {room.milestones.length} stappen
                        afgerond
                    </p>
                </div>
                <div className="md:border-l md:border-white/15 md:pl-6">
                    <p className="text-xs text-white/60">Koopsom</p>
                    <p className="mt-1 text-lg font-semibold">
                        {new Intl.NumberFormat("nl-NL", {
                            style: "currency",
                            currency: "EUR",
                            maximumFractionDigits: 0,
                        }).format(Number(room.purchasePriceCents) / 100)}
                    </p>
                </div>
                <div className="md:border-l md:border-white/15 md:pl-6">
                    <p className="text-xs text-white/60">Beoogde overdracht</p>
                    <p className="mt-1 text-sm font-semibold">
                        {room.targetTransferDate
                            ? new Date(
                                  room.targetTransferDate,
                              ).toLocaleDateString("nl-NL")
                            : "Nog afspreken"}
                    </p>
                </div>
            </div>
            <div
                className="mt-5 flex gap-1 overflow-x-auto border-b border-line"
                role="tablist"
            >
                {tabs
                    .filter(([id]) => id !== "security" || isSale)
                    .map(([id, label, Icon]) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${tab === id ? "border-brand text-brand" : "border-transparent text-muted"}`}
                        >
                            <Icon size={16} />{" "}
                            {id === "contract" ? contractTabLabel : label}
                        </button>
                    ))}
            </div>
            <div className="mt-6">
                {tab === "overview" && (
                    <Overview room={room} isSeller={isSeller} isSale={isSale} />
                )}
                {tab === "passport" && (
                    <Passport
                        room={room}
                        data={passportQuery.data}
                        isSeller={isSeller}
                        closed={closed}
                        refresh={refresh}
                        onOpenDocuments={() => setTab("documents")}
                    />
                )}
                {tab === "contract" &&
                    (isSale ? (
                        <Koopovereenkomst
                            room={room}
                            isSeller={isSeller}
                            closed={closed}
                            refresh={refresh}
                            signNotice={signNotice}
                        />
                    ) : (
                        <Contract
                            room={room}
                            currentUserId={currentUserId}
                            closed={closed}
                            refresh={refresh}
                        />
                    ))}
                {tab === "security" && isSale && (
                    <SecurityDeposit
                        room={room}
                        isSeller={isSeller}
                        closed={closed}
                        refresh={refresh}
                    />
                )}
                {tab === "notary" && (
                    <Notary
                        room={room}
                        isSeller={isSeller}
                        isSale={isSale}
                        closed={closed}
                        refresh={refresh}
                    />
                )}
                {tab === "handover" && (
                    <Handover room={room} closed={closed} refresh={refresh} />
                )}
                {tab === "documents" && (
                    <Documents room={room} closed={closed} refresh={refresh} />
                )}
                {tab === "chat" && (
                    <Chat
                        room={room}
                        currentUserId={currentUserId}
                        closed={closed}
                        refresh={refresh}
                    />
                )}
            </div>
        </div>
    );
}

function Panel({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border border-line bg-surface p-5 sm:p-7">
            <h2 className="text-xl font-semibold">{title}</h2>
            {description && (
                <p className="mt-1 text-sm leading-6 text-muted">
                    {description}
                </p>
            )}
            <div className="mt-5">{children}</div>
        </section>
    );
}

/** Toont de effectieve status van een mijlpaal, inclusief tijdsafhankelijke
 * overgangen (verlopen deadlines, beëindigde bedenktijd). De database-status
 * wordt door de voortgangsmotor actueel gehouden; deze helper maakt weergave
 * ook zonder herberekening correct. */
function effectiveStatus(room: Room, milestone: Milestone): string {
    if (milestone.status === "COMPLETED" || milestone.status === "WAIVED")
        return milestone.status;
    if (
        milestone.type === "COOLING_OFF_PERIOD" &&
        room.coolingOffEndsAt &&
        new Date(room.coolingOffEndsAt).getTime() <= Date.now()
    )
        return "COMPLETED";
    if (milestone.dueAt && new Date(milestone.dueAt).getTime() < Date.now())
        return "OVERDUE";
    return milestone.status;
}

const toneStyles: Record<string, string> = {
    done: "bg-brand/10 text-brand",
    active: "bg-brand/10 text-brand",
    waiting: "bg-background text-muted",
    overdue: "bg-red-50 text-red-700",
    waived: "bg-background text-muted",
};

function StepIcon({ tone }: { tone: string }) {
    const base = "grid size-9 shrink-0 place-items-center rounded-full border";
    if (tone === "done")
        return (
            <span className={`${base} border-brand bg-brand text-white`}>
                <Check size={17} />
            </span>
        );
    if (tone === "waived")
        return (
            <span className={`${base} border-line bg-background text-muted`}>
                <Minus size={17} />
            </span>
        );
    if (tone === "overdue")
        return (
            <span className={`${base} border-red-200 bg-red-50 text-red-700`}>
                <AlertCircle size={17} />
            </span>
        );
    return (
        <span className={`${base} border-brand/40 bg-brand/5 text-brand`}>
            <Clock3 size={17} />
        </span>
    );
}

function actorLabel(actor: string, isSale: boolean): string {
    if (actor === "both") return "Beide partijen";
    return actor === "seller"
        ? isSale
            ? "Verkoper"
            : "Verhuurder"
        : isSale
          ? "Koper"
          : "Huurder";
}

type StepView = {
    label: string;
    tone: "done" | "active" | "waiting" | "overdue" | "waived";
    explanation: string;
    nextAction: string | null;
    actor: "seller" | "buyer" | "both" | null;
};

function conditionStep(
    subject: string,
    categoryLabel: string,
    status: string,
): StepView {
    if (status === "WAIVED")
        return {
            label: "Niet van toepassing",
            tone: "waived",
            explanation: `Er is geen ${subject} overeengekomen.`,
            nextAction: null,
            actor: null,
        };
    if (status === "COMPLETED")
        return {
            label: "Afgerond",
            tone: "done",
            explanation: `De ${subject} is geregeld; het bewijsstuk is in de documentkluis geüpload.`,
            nextAction: null,
            actor: null,
        };
    if (status === "OVERDUE")
        return {
            label: "Deadline verstreken",
            tone: "overdue",
            explanation: `De termijn voor ${subject} is verstreken.`,
            nextAction: `Regel ${subject} en upload het bewijsstuk onder Documenten.`,
            actor: "buyer",
        };
    if (status === "IN_PROGRESS")
        return {
            label: "In behandeling",
            tone: "active",
            explanation: `De ${subject} moet vóór de deadline geregeld zijn.`,
            nextAction: `Upload het bewijsstuk (categorie “${categoryLabel}”) onder Documenten om deze stap automatisch af te ronden.`,
            actor: "buyer",
        };
    return {
        label: "Nog niet gestart",
        tone: "waiting",
        explanation: `De termijn voor ${subject} start na ondertekening van de overeenkomst.`,
        nextAction: null,
        actor: "buyer",
    };
}

/** Declaratieve weergave van een stap: status, uitleg en de volgende actie
 * met de verantwoordelijke rol. Er is geen handmatige afvinklogica meer. */
function describeStep(
    room: Room,
    milestone: Milestone,
    isSeller: boolean,
    isSale: boolean,
): StepView {
    const status = effectiveStatus(room, milestone);
    switch (milestone.type) {
        case "PURCHASE_AGREEMENT":
            if (status === "COMPLETED")
                return {
                    label: "Afgerond",
                    tone: "done",
                    explanation: isSale
                        ? "De koopovereenkomst is door koper en verkoper ondertekend."
                        : "De huurovereenkomst is door huurder en verhuurder bevestigd.",
                    nextAction: null,
                    actor: null,
                };
            if (status === "IN_PROGRESS")
                return {
                    label: "In behandeling",
                    tone: "active",
                    explanation: isSale
                        ? "De koopovereenkomst is opgesteld. De stap wordt automatisch afgerond zodra beide partijen hebben ondertekend."
                        : "De huurovereenkomst is opgesteld. De stap wordt automatisch afgerond zodra beide partijen hebben bevestigd.",
                    nextAction: `Open het tabblad ${isSale ? "Koopovereenkomst" : "Huurovereenkomst"} en ${isSale ? "onderteken" : "bevestig"} de overeenkomst.`,
                    actor: "both",
                };
            return {
                label: "Nog niet gestart",
                tone: "waiting",
                explanation: isSale
                    ? "De koopovereenkomst moet nog worden opgesteld."
                    : "De huurovereenkomst moet nog worden opgesteld.",
                nextAction: `Open het tabblad Contract om de ${isSale ? "koop" : "huur"}overeenkomst op te stellen.`,
                actor: "both",
            };
        case "COOLING_OFF_PERIOD":
            if (status === "WAIVED")
                return {
                    label: "Niet van toepassing",
                    tone: "waived",
                    explanation:
                        "Bij verhuur geldt geen wettelijke bedenktijd.",
                    nextAction: null,
                    actor: null,
                };
            if (status === "COMPLETED")
                return {
                    label: "Afgerond",
                    tone: "done",
                    explanation:
                        "De wettelijke bedenktijd (Art 7:2 lid 2 BW) is verstreken.",
                    nextAction: null,
                    actor: null,
                };
            if (status === "IN_PROGRESS")
                return {
                    label: "Bedenktijd loopt",
                    tone: "active",
                    explanation:
                        "De wettelijke bedenktijd van drie dagen loopt. Beide partijen kunnen de koop in deze periode ontbinden.",
                    nextAction: null,
                    actor: "both",
                };
            return {
                label: "Nog niet gestart",
                tone: "waiting",
                explanation:
                    "De bedenktijd start automatisch na ondertekening van de koopovereenkomst.",
                nextAction: null,
                actor: "both",
            };
        case "FINANCING":
            return conditionStep(
                "financieringsvoorbehoud",
                "Financiering",
                status,
            );
        case "BUILDING_INSPECTION":
            return conditionStep(
                "voorbehoud bouwkundige keuring",
                "Bouwkundige keuring",
                status,
            );
        case "SECURITY_DEPOSIT":
            if (status === "WAIVED")
                return {
                    label: "Niet van toepassing",
                    tone: "waived",
                    explanation: "Er is geen waarborgsom/borg overeengekomen.",
                    nextAction: null,
                    actor: null,
                };
            if (status === "COMPLETED")
                return {
                    label: "Afgerond",
                    tone: "done",
                    explanation:
                        "De waarborgsom/borg is geregeld; het bewijsstuk is in de documentkluis geüpload.",
                    nextAction: null,
                    actor: null,
                };
            if (status === "OVERDUE")
                return {
                    label: "Deadline verstreken",
                    tone: "overdue",
                    explanation:
                        "De termijn voor de waarborgsom/borg is verstreken.",
                    nextAction:
                        "Regel de waarborgsom/borg op het tabblad Waarborgsom.",
                    actor: "buyer",
                };
            if (status === "IN_PROGRESS")
                return {
                    label: "In behandeling",
                    tone: "active",
                    explanation:
                        "De waarborgsom/borg moet vóór de deadline geregeld zijn.",
                    nextAction:
                        "Ga naar het tabblad Waarborgsom om de waarborgsom/borg te regelen.",
                    actor: "buyer",
                };
            return {
                label: "Nog niet gestart",
                tone: "waiting",
                explanation:
                    "De termijn voor de waarborgsom/borg start na ondertekening van de overeenkomst.",
                nextAction:
                    "Regel de waarborgsom/borg op het tabblad Waarborgsom.",
                actor: "buyer",
            };
        case "NOTARY_SELECTION":
            if (status === "WAIVED")
                return {
                    label: "Niet van toepassing",
                    tone: "waived",
                    explanation:
                        "Bij verhuur is geen notaris nodig voor de overdracht.",
                    nextAction: null,
                    actor: null,
                };
            if (status === "COMPLETED")
                return {
                    label: "Afgerond",
                    tone: "done",
                    explanation: "De koper heeft de notaris bevestigd.",
                    nextAction: null,
                    actor: null,
                };
            if (status === "IN_PROGRESS")
                return {
                    label: "Voorstel gedaan",
                    tone: "active",
                    explanation:
                        "De verkoper heeft een notaris voorgesteld. De stap wordt afgerond zodra de koper bevestigt.",
                    nextAction: isSeller
                        ? "Wacht tot de koper de voorgestelde notaris bevestigt of wijzigt."
                        : "Bevestig of wijzig de notaris op het tabblad Notaris.",
                    actor: "buyer",
                };
            return {
                label: "Nog niet gestart",
                tone: "waiting",
                explanation:
                    "Er is nog geen notaris gekozen. De koper kiest de notaris; de verkoper kan een voorstel doen.",
                nextAction: isSeller
                    ? "Stel een notaris voor op het tabblad Notaris; de koper bevestigt."
                    : "Kies een notaris op het tabblad Notaris.",
                actor: "buyer",
            };
        case "DEED_OF_TRANSFER":
            if (status === "WAIVED")
                return {
                    label: "Niet van toepassing",
                    tone: "waived",
                    explanation:
                        "Bij verhuur wordt geen leveringsakte opgemaakt; de huur gaat in op de afgesproken datum.",
                    nextAction: null,
                    actor: null,
                };
            if (status === "COMPLETED")
                return {
                    label: "Afgerond",
                    tone: "done",
                    explanation: "De leveringsakte is gepasseerd.",
                    nextAction: null,
                    actor: null,
                };
            return {
                label: status === "IN_PROGRESS" ? "In behandeling" : "Gepland",
                tone: status === "IN_PROGRESS" ? "active" : "waiting",
                explanation:
                    "De overdracht bij de notaris staat gepland en wordt bijgewerkt zodra alle voorwaarden zijn voldaan.",
                nextAction: null,
                actor: "both",
            };
        case "FINAL_INSPECTION":
            if (status === "COMPLETED")
                return {
                    label: "Afgerond",
                    tone: "done",
                    explanation:
                        "De eindinspectie en meterstanden zijn vastgelegd.",
                    nextAction: null,
                    actor: null,
                };
            return {
                label: "Nog niet gestart",
                tone: "waiting",
                explanation:
                    "De eindinspectie en meterstanden moeten vóór de overdracht worden vastgelegd.",
                nextAction: "Vul de oplevering in op het tabblad Oplevering.",
                actor: "both",
            };
        case "KEY_HANDOVER":
            if (status === "COMPLETED")
                return {
                    label: "Afgerond",
                    tone: "done",
                    explanation: "De sleuteloverdracht is voltooid.",
                    nextAction: null,
                    actor: null,
                };
            return {
                label: "Nog niet gestart",
                tone: "waiting",
                explanation:
                    "De sleuteloverdracht vindt plaats op de dag van de overdracht.",
                nextAction: null,
                actor: "both",
            };
        default:
            return {
                label: "In behandeling",
                tone: "active",
                explanation:
                    "De status van deze stap wordt automatisch bijgewerkt.",
                nextAction: null,
                actor: null,
            };
    }
}

function Overview({
    room,
    isSeller,
    isSale,
}: {
    room: Room;
    isSeller: boolean;
    isSale: boolean;
}) {
    return (
        <div className="grid gap-5 lg:grid-cols-[1.45fr_0.55fr]">
            <Panel
                title="Stappen naar de overdracht"
                description="De voortgang wordt automatisch bijgewerkt op basis van ondertekeningen, bevestigingen, documenten en oplevergegevens."
            >
                <div className="divide-y divide-line">
                    {room.milestones.map((item) => {
                        const view = describeStep(room, item, isSeller, isSale);
                        return (
                            <div
                                key={item.id}
                                className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                            >
                                <StepIcon tone={view.tone} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold">
                                            {item.title}
                                        </p>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneStyles[view.tone]}`}
                                        >
                                            {view.label}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-muted">
                                        {view.explanation}
                                    </p>
                                    {view.nextAction && (
                                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-brand">
                                            <span aria-hidden>→</span>
                                            {view.actor && (
                                                <span className="uppercase tracking-wide text-muted">
                                                    {actorLabel(
                                                        view.actor,
                                                        isSale,
                                                    )}
                                                </span>
                                            )}
                                            <span>{view.nextAction}</span>
                                        </p>
                                    )}
                                    {item.dueAt &&
                                        (view.tone === "active" ||
                                            view.tone === "overdue") && (
                                            <p
                                                className={`mt-1 text-[11px] ${view.tone === "overdue" ? "text-red-700" : "text-muted"}`}
                                            >
                                                Deadline:{" "}
                                                {new Date(
                                                    item.dueAt,
                                                ).toLocaleDateString("nl-NL")}
                                            </p>
                                        )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Panel>
            <div className="grid content-start gap-5">
                <Panel title="Partijen">
                    <div className="grid gap-4 text-sm">
                        <Person
                            label={isSale ? "Verkoper" : "Verhuurder"}
                            person={room.seller}
                        />
                        <Person
                            label={isSale ? "Koper" : "Huurder"}
                            person={room.buyer}
                        />
                    </div>
                </Panel>
                <Panel title="Woning">
                    <div className="grid gap-3 text-sm">
                        <Info
                            label="Adres"
                            value={`${room.listing.property.postcode} ${room.listing.property.city}`}
                        />
                        <Info
                            label="Woonoppervlak"
                            value={
                                room.listing.property.livingAreaSqm
                                    ? `${room.listing.property.livingAreaSqm} m²`
                                    : "Onbekend"
                            }
                        />
                        <Info
                            label="Kamers"
                            value={String(
                                room.listing.property.roomCount ?? "Onbekend",
                            )}
                        />
                        <Info
                            label="Bouwjaar"
                            value={String(
                                room.listing.property.constructionYear ??
                                    "Onbekend",
                            )}
                        />
                    </div>
                    {room.listing.publicSlug && (
                        <Link
                            href={`/property/${room.listing.publicSlug}`}
                            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand"
                        >
                            Bekijk advertentie <ChevronRight size={15} />
                        </Link>
                    )}
                </Panel>
            </div>
        </div>
    );
}

function Person({ label, person }: { label: string; person: Person }) {
    return (
        <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-background">
                <Building2 size={16} />
            </span>
            <div>
                <p className="text-xs text-muted">{label}</p>
                <p className="font-semibold">{person.name}</p>
                <p className="text-xs text-muted">{person.email}</p>
            </div>
        </div>
    );
}
function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
            <span className="text-muted">{label}</span>
            <span className="text-right font-semibold">{value}</span>
        </div>
    );
}

const passportStatusNames: Record<string, string> = {
    SATISFIED: "Aanwezig",
    MISSING: "Ontbreekt",
    NOT_APPLICABLE: "Niet van toepassing",
};
const passportStatusTones: Record<string, string> = {
    SATISFIED: "bg-brand/10 text-brand",
    MISSING: "bg-amber-50 text-amber-700",
    NOT_APPLICABLE: "bg-background text-muted",
};
const conditionOptions = [
    ["", "Niet ingevuld"],
    ["EXCELLENT", "Uitstekend"],
    ["GOOD", "Goed"],
    ["REASONABLE", "Redelijk"],
    ["POOR", "Matig"],
];
const insulationOptions = [
    ["DAK", "Dakisolatie"],
    ["SPOUWMUUR", "Spouwmuurisolatie"],
    ["VLOER", "Vloerisolatie"],
    ["DUBBEL_GLAS", "Dubbel glas"],
    ["HR_GLAS", "HR++ glas"],
    ["HRP_GLAS", "HR+++ glas"],
];

function Passport({
    room,
    data,
    isSeller,
    closed,
    refresh,
    onOpenDocuments,
}: {
    room: Room;
    data: PassportData | undefined;
    isSeller: boolean;
    closed: boolean;
    refresh: () => Promise<void>;
    onOpenDocuments: () => void;
}) {
    const versions = data?.versions ?? [];
    const draft = data?.draft;
    const completeness = draft?.completeness;
    const latest = versions[0];
    const [changeNote, setChangeNote] = useState("");
    const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
    const [uploadFiles, setUploadFiles] = useState<Record<string, File | null>>(
        {},
    );
    const [uploadingCategory, setUploadingCategory] = useState<string | null>(
        null,
    );
    const isApartment = room.listing.property.propertyType === "APARTMENT";

    const publishMutation = useMutation({
        mutationFn: () =>
            api(`/api/transactions/${room.id}/passport`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ changeNote }),
            }),
        onSuccess: async () => {
            setChangeNote("");
            setSavedFeedback("Nieuwe versie vastgelegd.");
            await refresh();
        },
    });
    const draftMutation = useMutation({
        mutationFn: (fields: Record<string, unknown>) =>
            api(`/api/transactions/${room.id}/passport`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(fields),
            }),
        onSuccess: async () => {
            setSavedFeedback(
                "Gegevens opgeslagen. Er is automatisch een nieuwe versie vastgelegd.",
            );
            await refresh();
        },
    });
    const uploadMutation = useMutation({
        mutationFn: async () => {
            const category = uploadingCategory;
            const file = category ? uploadFiles[category] : null;
            if (!category || !file)
                throw new Error("Selecteer eerst een document");
            const form = new FormData();
            form.set("file", file);
            form.set("category", category);
            return api(`/api/transactions/${room.id}/documents`, {
                method: "POST",
                body: form,
            });
        },
        onSuccess: async () => {
            setUploadingCategory(null);
            setUploadFiles({});
            setSavedFeedback(
                "Document toegevoegd aan het dossier; het woningpaspoort is bijgewerkt.",
            );
            await refresh();
        },
    });
    const pdfMutation = useMutation({
        mutationFn: () =>
            api(`/api/transactions/${room.id}/generated-documents`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ type: "PASSPORT" }),
            }),
        onSuccess: async () => {
            setSavedFeedback(
                "PDF toegevoegd aan de documentkluis. Bekijk hem onder Documenten.",
            );
            await refresh();
        },
    });

    return (
        <div className="grid gap-5">
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                <Panel
                    title="Volledigheid"
                    description="Het woningpaspoort is een verifieerbare momentopname van het woningdossier en wordt automatisch bijgewerkt bij wijzigingen."
                >
                    {completeness ? (
                        <>
                            <div className="grid place-items-center bg-background p-7 text-center">
                                <div className="grid size-16 place-items-center rounded-full bg-brand text-white">
                                    <ShieldCheck size={30} />
                                </div>
                                <p className="mt-4 text-3xl font-semibold">
                                    {completeness.score}%
                                </p>
                                <p className="text-sm text-muted">
                                    {completeness.satisfied} van{" "}
                                    {completeness.applicable} onderdelen
                                    compleet
                                </p>
                            </div>
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
                                <div
                                    className="h-full bg-brand"
                                    style={{ width: `${completeness.score}%` }}
                                />
                            </div>
                            {draft?.hasChangesSinceLatest && isSeller && (
                                <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-amber-700">
                                    <AlertCircle size={16} />
                                    Er zijn nieuwe gegevens sinds versie{" "}
                                    {latest?.version ?? 0}. Leg een nieuwe
                                    versie vast.
                                </p>
                            )}
                            {latest ? (
                                <div className="mt-5 grid gap-3 text-sm">
                                    <Info
                                        label="Laatste versie"
                                        value={`Versie ${latest.version}`}
                                    />
                                    <Info
                                        label="Vastgelegd"
                                        value={new Date(
                                            latest.createdAt,
                                        ).toLocaleString("nl-NL")}
                                    />
                                    <div>
                                        <p className="text-xs text-muted">
                                            SHA-256 vingerafdruk
                                        </p>
                                        <code className="mt-1 block break-all bg-background p-3 text-[11px]">
                                            {latest.entryHash}
                                        </code>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-5 text-sm text-muted">
                                    Er is nog geen woningpaspoort vastgelegd.
                                    Vul de onderdelen aan om een eerste versie
                                    te maken.
                                </p>
                            )}
                            {latest && (
                                <button
                                    onClick={() => pdfMutation.mutate()}
                                    disabled={pdfMutation.isPending}
                                    className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 border border-brand text-sm font-semibold text-brand"
                                >
                                    {pdfMutation.isPending ? (
                                        <LoaderCircle
                                            className="animate-spin"
                                            size={16}
                                        />
                                    ) : (
                                        <Download size={16} />
                                    )}{" "}
                                    PDF in documentkluis zetten
                                </button>
                            )}
                            {savedFeedback && (
                                <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                                    <CheckCircle2 size={16} /> {savedFeedback}
                                    {savedFeedback.includes("Documenten") && (
                                        <button
                                            onClick={onOpenDocuments}
                                            className="underline"
                                        >
                                            Openen
                                        </button>
                                    )}
                                </p>
                            )}
                            {pdfMutation.error && (
                                <p className="mt-3 text-sm text-red-700">
                                    {pdfMutation.error.message}
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-muted">
                            Het paspoort wordt geladen.
                        </p>
                    )}
                </Panel>
                <Panel
                    title="Checklist"
                    description="Dit bepaalt de volledigheid. Ontbrekende onderdelen kun je als verkoper/verhuurder direct aanvullen."
                >
                    <div className="grid gap-3">
                        {completeness?.items.map((item) => (
                            <ChecklistItem
                                key={item.key}
                                item={item}
                                isSeller={isSeller}
                                closed={closed}
                                file={uploadFiles[item.category ?? ""] ?? null}
                                onSelectFile={(file) =>
                                    setUploadFiles((current) => ({
                                        ...current,
                                        [item.category ?? ""]: file,
                                    }))
                                }
                                onUpload={() => {
                                    setUploadingCategory(item.category ?? "");
                                    uploadMutation.mutate();
                                }}
                                uploading={
                                    uploadingCategory === item.category &&
                                    uploadMutation.isPending
                                }
                            />
                        ))}
                    </div>
                    {uploadMutation.error && (
                        <p className="mt-4 text-sm text-red-700">
                            {uploadMutation.error.message}
                        </p>
                    )}
                    {!completeness && (
                        <p className="text-sm text-muted">
                            Het paspoort wordt geladen.
                        </p>
                    )}
                </Panel>
            </div>

            {isSeller && !closed && (
                <Panel
                    title="Gegevens aanvullen"
                    description="Vul de staat, verduurzaming en VvE-gegevens in. Elke wijziging legt automatisch een nieuwe versie vast."
                >
                    <DraftEditor
                        initialValues={draft?.editableFields ?? {}}
                        isApartment={isApartment}
                        onSubmit={(form) =>
                            draftMutation.mutate(draftFromForm(form))
                        }
                    />
                    {draftMutation.error && (
                        <p className="mt-3 text-sm text-red-700">
                            {draftMutation.error.message}
                        </p>
                    )}
                </Panel>
            )}

            <Panel
                title="Versiegeschiedenis"
                description="Elke versie verwijst naar de vorige. Daardoor zijn latere wijzigingen aantoonbaar en onveranderlijk."
            >
                {isSeller && !closed && draft?.hasChangesSinceLatest && (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            publishMutation.mutate();
                        }}
                        className="mb-6 flex flex-col gap-2 border-b border-line pb-6 sm:flex-row"
                    >
                        <input
                            value={changeNote}
                            onChange={(event) =>
                                setChangeNote(event.target.value)
                            }
                            minLength={3}
                            maxLength={500}
                            required
                            placeholder="Wat is er gewijzigd?"
                            className="input"
                        />
                        <button
                            disabled={publishMutation.isPending}
                            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-brand px-5 text-sm font-semibold text-white"
                        >
                            <ShieldCheck size={16} /> Nieuwe versie vastleggen
                        </button>
                    </form>
                )}
                {publishMutation.error && (
                    <p className="mb-4 text-sm text-red-700">
                        {publishMutation.error.message}
                    </p>
                )}
                {versions.length ? (
                    <div className="grid gap-3">
                        {versions.map((version) => (
                            <div
                                key={version.id}
                                className="flex gap-4 border border-line p-4"
                            >
                                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-background font-semibold text-brand">
                                    v{version.version}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold">
                                            {version.snapshot.changeNote ??
                                                (version.version === 1
                                                    ? "Eerste versie"
                                                    : "Nieuwe dossiermomentopname")}
                                        </p>
                                        <span className="text-xs text-muted">
                                            {version.completenessScore}%
                                            compleet
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-muted">
                                        {new Date(
                                            version.createdAt,
                                        ).toLocaleString("nl-NL")}
                                    </p>
                                    <div className="mt-2 grid gap-1">
                                        <p className="truncate font-mono text-[10px] text-muted">
                                            hash: {version.entryHash}
                                        </p>
                                        {version.previousHash && (
                                            <p className="truncate font-mono text-[10px] text-muted">
                                                vorige: {version.previousHash}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="py-8 text-center text-sm text-muted">
                        Nog geen versies vastgelegd.
                    </p>
                )}
            </Panel>
        </div>
    );
}

function ChecklistItem({
    item,
    isSeller,
    closed,
    file,
    onSelectFile,
    onUpload,
    uploading,
}: {
    item: PassportItem;
    isSeller: boolean;
    closed: boolean;
    file: File | null;
    onSelectFile: (file: File) => void;
    onUpload: () => void;
    uploading: boolean;
}) {
    const tone = passportStatusTones[item.status] ?? "bg-background text-muted";
    const icon =
        item.status === "SATISFIED" ? (
            <CheckCircle2 className="shrink-0 text-brand" size={20} />
        ) : item.status === "NOT_APPLICABLE" ? (
            <Minus className="shrink-0 text-muted" size={20} />
        ) : (
            <AlertCircle className="shrink-0 text-amber-600" size={20} />
        );
    return (
        <div className="flex items-start gap-3 border border-line p-4">
            <span className="mt-0.5">{icon}</span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{item.label}</p>
                    <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
                    >
                        {passportStatusNames[item.status] ?? item.status}
                    </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">
                    {item.description}
                </p>
                {item.status === "MISSING" && (
                    <p className="mt-2 text-xs font-semibold text-brand">
                        {item.actionHint}
                    </p>
                )}
                {isSeller &&
                    !closed &&
                    item.status === "MISSING" &&
                    item.category && (
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (file) onUpload();
                            }}
                            className="mt-3 flex flex-wrap items-center gap-2"
                        >
                            <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                onChange={(event) => {
                                    const selected =
                                        event.target.files?.[0] ?? null;
                                    if (selected) onSelectFile(selected);
                                }}
                                className="text-xs"
                            />
                            <button
                                disabled={!file || uploading}
                                className="inline-flex h-9 items-center gap-2 border border-brand px-3 text-xs font-semibold text-brand disabled:opacity-50"
                            >
                                {uploading ? (
                                    <LoaderCircle
                                        className="animate-spin"
                                        size={14}
                                    />
                                ) : (
                                    <Upload size={14} />
                                )}{" "}
                                Uploaden
                            </button>
                        </form>
                    )}
            </div>
        </div>
    );
}

/** Leest de bewerkbare paspoortvelden uit een (ongestuurd) formulier en
 * vormt ze om naar de draft-schema-vorm die de API verwacht. */
function draftFromForm(form: FormData): Record<string, unknown> {
    const str = (key: string) => {
        const value = form.get(key);
        return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const num = (key: string) => {
        const value = form.get(key);
        if (typeof value !== "string" || !value.trim()) return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    };
    const vveName = str("vveName");
    const vveContact = str("vveContactEmail");
    const vveMonthly = num("vveMonthly");
    const vveReserve = num("vveReserve");
    const vve =
        vveName || vveContact || vveMonthly || vveReserve
            ? {
                  ...(vveName ? { name: vveName } : {}),
                  ...(vveContact ? { contactEmail: vveContact } : {}),
                  ...(vveMonthly
                      ? {
                            monthlyContributionCents: Math.round(
                                vveMonthly * 100,
                            ),
                        }
                      : {}),
                  ...(vveReserve
                      ? { reserveFundCents: Math.round(vveReserve * 100) }
                      : {}),
              }
            : null;
    return {
        condition: str("condition"),
        lastInspectionAt: str("lastInspectionAt"),
        renovationYear: num("renovationYear"),
        solarPanelWattage: num("solarPanelWattage"),
        heatPump: form.get("heatPump") === "on",
        boilerYear: num("boilerYear"),
        insulation: form.getAll("insulation").map(String).filter(Boolean),
        vve,
        features: str("features"),
        notes: str("notes"),
    };
}

function DraftEditor({
    initialValues,
    isApartment,
    onSubmit,
}: {
    initialValues: Record<string, unknown>;
    isApartment: boolean;
    onSubmit: (form: FormData) => void;
}) {
    const vve =
        initialValues.vve && typeof initialValues.vve === "object"
            ? (initialValues.vve as Record<string, unknown>)
            : {};
    const insulation = Array.isArray(initialValues.insulation)
        ? (initialValues.insulation as string[])
        : [];
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                onSubmit(new FormData(event.currentTarget));
            }}
            className="grid gap-5 sm:grid-cols-2"
        >
            <div className="grid content-start gap-4">
                <label className="text-sm font-semibold">
                    Algemene staat
                    <select
                        name="condition"
                        defaultValue={String(initialValues.condition ?? "")}
                        className="input mt-2"
                    >
                        {conditionOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-sm font-semibold">
                    Laatste bouwkundige keuring
                    <input
                        type="date"
                        name="lastInspectionAt"
                        defaultValue={String(
                            initialValues.lastInspectionAt ?? "",
                        )}
                        className="input mt-2"
                    />
                </label>
                <label className="text-sm font-semibold">
                    Renovatiejaar
                    <input
                        type="number"
                        name="renovationYear"
                        min={1900}
                        max={2100}
                        defaultValue={String(
                            initialValues.renovationYear ?? "",
                        )}
                        className="input mt-2"
                    />
                </label>
                <label className="flex items-center gap-3 text-sm">
                    <input
                        type="checkbox"
                        name="heatPump"
                        defaultChecked={Boolean(initialValues.heatPump)}
                        className="size-4 accent-brand"
                    />{" "}
                    Warmtepomp aanwezig
                </label>
                <label className="text-sm font-semibold">
                    CV-ketel bouwjaar
                    <input
                        type="number"
                        name="boilerYear"
                        min={1900}
                        max={2100}
                        defaultValue={String(initialValues.boilerYear ?? "")}
                        className="input mt-2"
                    />
                </label>
                <label className="text-sm font-semibold">
                    Zonnepanelen (Wp)
                    <input
                        type="number"
                        name="solarPanelWattage"
                        min={0}
                        defaultValue={String(
                            initialValues.solarPanelWattage ?? "",
                        )}
                        className="input mt-2"
                    />
                </label>
            </div>
            <div className="grid content-start gap-4">
                <div>
                    <p className="text-sm font-semibold">Isolatie</p>
                    <div className="mt-2 grid gap-2">
                        {insulationOptions.map(([value, label]) => (
                            <label
                                key={value}
                                className="flex items-center gap-3 text-sm"
                            >
                                <input
                                    type="checkbox"
                                    name="insulation"
                                    value={value}
                                    defaultChecked={insulation.includes(value)}
                                    className="size-4 accent-brand"
                                />{" "}
                                {label}
                            </label>
                        ))}
                    </div>
                </div>
            </div>
            {isApartment && (
                <div className="grid gap-4 sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        VvE-gegevens
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-semibold">
                            VvE-naam
                            <input
                                name="vveName"
                                defaultValue={String(vve.name ?? "")}
                                className="input mt-2"
                            />
                        </label>
                        <label className="text-sm font-semibold">
                            Contact (e-mail)
                            <input
                                type="email"
                                name="vveContactEmail"
                                defaultValue={String(vve.contactEmail ?? "")}
                                className="input mt-2"
                            />
                        </label>
                        <label className="text-sm font-semibold">
                            Maandelijkse bijdrage (€)
                            <input
                                type="number"
                                name="vveMonthly"
                                min={0}
                                defaultValue={
                                    vve.monthlyContributionCents
                                        ? String(
                                              Number(
                                                  vve.monthlyContributionCents,
                                              ) / 100,
                                          )
                                        : ""
                                }
                                className="input mt-2"
                            />
                        </label>
                        <label className="text-sm font-semibold">
                            Reserveringsfonds (€)
                            <input
                                type="number"
                                name="vveReserve"
                                min={0}
                                defaultValue={
                                    vve.reserveFundCents
                                        ? String(
                                              Number(vve.reserveFundCents) /
                                                  100,
                                          )
                                        : ""
                                }
                                className="input mt-2"
                            />
                        </label>
                    </div>
                </div>
            )}
            <label className="text-sm font-semibold sm:col-span-2">
                Bijzondere kenmerken
                <textarea
                    name="features"
                    defaultValue={String(initialValues.features ?? "")}
                    rows={3}
                    maxLength={1000}
                    className="input mt-2 py-3"
                />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
                Toelichting / eigen verklaring
                <textarea
                    name="notes"
                    defaultValue={String(initialValues.notes ?? "")}
                    rows={4}
                    maxLength={2000}
                    className="input mt-2 py-3"
                />
            </label>
            <div className="sm:col-span-2">
                <button
                    type="submit"
                    disabled={false}
                    className="inline-flex h-11 items-center gap-2 bg-brand px-5 text-sm font-semibold text-white"
                >
                    <Save size={16} /> Opslaan en versie vastleggen
                </button>
            </div>
        </form>
    );
}

function Contract({
    room,
    currentUserId,
    closed,
    refresh,
}: {
    room: Room;
    currentUserId: string;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const currentTerms = room.contractTerms ?? {};
    const [additionalTerms, setAdditionalTerms] = useState(
        String(currentTerms.additionalTerms ?? ""),
    );
    const [financingCondition, setFinancingCondition] = useState(
        Boolean(currentTerms.financingCondition ?? true),
    );
    const [inspectionCondition, setInspectionCondition] = useState(
        Boolean(currentTerms.inspectionCondition ?? true),
    );
    const [securityDeposit, setSecurityDeposit] = useState(
        String(Number(currentTerms.securityDepositCents ?? 0) / 100 || ""),
    );
    const isSale = room.listing.purpose === "SALE";
    const sellerRole = isSale ? "Verkoper" : "Verhuurder";
    const buyerRole = isSale ? "Koper" : "Huurder";
    const confirmed =
        currentUserId === room.sellerUserId
            ? room.sellerContractConfirmedAt
            : room.buyerContractConfirmedAt;
    const mutation = useMutation({
        mutationFn: (confirm: boolean) =>
            api(`/api/transactions/${room.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    section: "CONTRACT",
                    contractTerms: {
                        additionalTerms,
                        financingCondition,
                        inspectionCondition,
                        securityDepositCents: securityDeposit
                            ? String(Math.round(Number(securityDeposit) * 100))
                            : undefined,
                    },
                    confirm,
                }),
            }),
        onSuccess: refresh,
    });
    const pdfMutation = useMutation({
        mutationFn: () =>
            api(`/api/transactions/${room.id}/generated-documents`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ type: "AGREEMENT" }),
            }),
        onSuccess: refresh,
    });
    return (
        <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
            <Panel
                title={
                    isSale
                        ? "Afspraken voor de koopovereenkomst"
                        : "Afspraken voor de huurovereenkomst"
                }
                description={
                    isSale
                        ? "Deze gestructureerde afspraken vormen het overdrachtsdossier voor de uiteindelijke overeenkomst en notaris."
                        : "Deze gestructureerde afspraken vormen de basis voor de huurovereenkomst. De stap wordt automatisch afgerond zodra beide partijen hebben bevestigd."
                }
            >
                <div className="grid gap-5">
                    <Info
                        label={
                            isSale
                                ? "Geaccepteerde koopsom"
                                : "Afgesproken maandhuur"
                        }
                        value={new Intl.NumberFormat("nl-NL", {
                            style: "currency",
                            currency: "EUR",
                        }).format(Number(room.purchasePriceCents) / 100)}
                    />
                    <label className="flex items-center gap-3 text-sm">
                        <input
                            type="checkbox"
                            checked={financingCondition}
                            onChange={(event) =>
                                setFinancingCondition(event.target.checked)
                            }
                            className="size-4 accent-brand"
                            disabled={closed}
                        />{" "}
                        Voorbehoud van financiering
                    </label>
                    <label className="flex items-center gap-3 text-sm">
                        <input
                            type="checkbox"
                            checked={inspectionCondition}
                            onChange={(event) =>
                                setInspectionCondition(event.target.checked)
                            }
                            className="size-4 accent-brand"
                            disabled={closed}
                        />{" "}
                        Voorbehoud bouwkundige keuring
                    </label>
                    <label className="text-sm font-semibold">
                        {isSale ? "Waarborgsom / bankgarantie (€)" : "Borg (€)"}
                        <input
                            type="number"
                            min="0"
                            step="100"
                            value={securityDeposit}
                            onChange={(event) =>
                                setSecurityDeposit(event.target.value)
                            }
                            className="input mt-2"
                            disabled={closed}
                        />
                    </label>
                    <label className="text-sm font-semibold">
                        Aanvullende afspraken
                        <textarea
                            value={additionalTerms}
                            onChange={(event) =>
                                setAdditionalTerms(event.target.value)
                            }
                            rows={6}
                            maxLength={3000}
                            className="input mt-2 py-3"
                            disabled={closed}
                        />
                    </label>
                </div>
                {!closed && (
                    <div className="mt-6 flex flex-wrap gap-2">
                        <button
                            onClick={() => mutation.mutate(false)}
                            disabled={mutation.isPending}
                            className="inline-flex h-11 items-center gap-2 border border-brand px-4 text-sm font-semibold text-brand"
                        >
                            <FileText size={16} /> Afspraken opslaan
                        </button>
                        <button
                            onClick={() => mutation.mutate(true)}
                            disabled={mutation.isPending}
                            className="inline-flex h-11 items-center gap-2 bg-brand px-4 text-sm font-semibold text-white"
                        >
                            <Check size={16} /> Opslaan en bevestigen
                        </button>
                    </div>
                )}
                {mutation.error && (
                    <p className="mt-4 text-sm text-red-700">
                        {mutation.error.message}
                    </p>
                )}
            </Panel>
            <Panel
                title="Bevestigingen"
                description="Bij een inhoudelijke wijziging vervallen eerdere bevestigingen."
            >
                <div className="grid gap-3">
                    <Confirmation
                        label={room.seller.name}
                        role={sellerRole}
                        date={room.sellerContractConfirmedAt}
                    />
                    <Confirmation
                        label={room.buyer.name}
                        role={buyerRole}
                        date={room.buyerContractConfirmedAt}
                    />
                </div>
                {room.sellerContractConfirmedAt &&
                    room.buyerContractConfirmedAt && (
                        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                            <CheckCircle2 size={17} /> De overeenkomst is door
                            beide partijen bevestigd — de stap wordt automatisch
                            afgerond.
                        </p>
                    )}
                <div className="mt-6 border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                    Deze bevestiging legt instemming in het transactiedossier
                    vast. Voor een juridisch gekwalificeerde elektronische
                    handtekening moet in productie een gecertificeerde
                    ondertekenprovider worden aangesloten.
                </div>
                {confirmed && (
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                        <CheckCircle2 size={17} /> Jij hebt de huidige afspraken
                        bevestigd
                    </p>
                )}
                {room.sellerContractConfirmedAt &&
                    room.buyerContractConfirmedAt && (
                        <button
                            onClick={() => pdfMutation.mutate()}
                            disabled={pdfMutation.isPending}
                            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 bg-brand-dark px-4 text-sm font-semibold text-white"
                        >
                            <FileText size={16} /> Overeenkomst-PDF genereren
                        </button>
                    )}
                {pdfMutation.error && (
                    <p className="mt-3 text-sm text-red-700">
                        {pdfMutation.error.message}
                    </p>
                )}
            </Panel>
        </div>
    );
}
function Confirmation({
    label,
    role,
    date,
}: {
    label: string;
    role: string;
    date: string | null;
}) {
    return (
        <div
            className={`flex items-center gap-3 border p-4 ${date ? "border-brand/30 bg-brand/5" : "border-line"}`}
        >
            {date ? (
                <CheckCircle2 className="text-brand" size={21} />
            ) : (
                <Circle className="text-muted" size={21} />
            )}
            <div>
                <p className="font-semibold">{label}</p>
                <p className="text-xs text-muted">
                    {role} ·{" "}
                    {date
                        ? `bevestigd ${new Date(date).toLocaleString("nl-NL")}`
                        : "nog niet bevestigd"}
                </p>
            </div>
        </div>
    );
}

function NotaryDetailsGrid({ details }: { details: Record<string, string> }) {
    const rows = [
        ["contactName", "Contactpersoon"],
        ["email", "E-mailadres"],
        ["phone", "Telefoon"],
        ["address", "Adres"],
        ["reference", "Dossiernummer"],
        ["clientAccountHolder", "Rekeninghouder (kwaliteitsrekening)"],
        ["clientAccountIban", "IBAN (kwaliteitsrekening)"],
    ] as const;
    return (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
                <p className="text-xs text-muted">Notariskantoor</p>
                <p className="font-semibold">{details.officeName}</p>
            </div>
            {rows
                .filter(([key]) => details[key])
                .map(([key, label]) => (
                    <div key={key}>
                        <p className="text-xs text-muted">{label}</p>
                        <p className="break-words">{details[key]}</p>
                    </div>
                ))}
        </div>
    );
}

type GuidanceRow = { title?: string; text: string };

function GuidanceList({ items }: { items: Array<GuidanceRow | string> }) {
    return (
        <div className="grid gap-3">
            {items.map((item, index) => {
                const row: GuidanceRow =
                    typeof item === "string" ? { text: item } : item;
                return (
                    <div
                        key={index}
                        className="flex items-start gap-3 text-sm leading-6"
                    >
                        <CheckCircle2
                            className="mt-0.5 shrink-0 text-brand"
                            size={17}
                        />
                        <div>
                            {row.title && (
                                <p className="font-semibold">{row.title}</p>
                            )}
                            <p className="text-muted">{row.text}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function GuidanceItem({ title, text }: GuidanceRow) {
    return (
        <div className="flex items-start gap-3 border border-line bg-background p-4 text-sm leading-6">
            <AlertCircle className="mt-0.5 shrink-0 text-brand" size={17} />
            <div>
                <p className="font-semibold">{title}</p>
                <p className="text-muted">{text}</p>
            </div>
        </div>
    );
}

function Notary({
    room,
    isSeller,
    isSale,
    closed,
    refresh,
}: {
    room: Room;
    isSeller: boolean;
    isSale: boolean;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const action = isSeller ? "PROPOSE" : "CONFIRM";
    const confirmed = room.notaryDetails ?? null;
    const proposal = room.notaryProposal ?? null;
    const mutation = useMutation({
        mutationFn: (details: Record<string, unknown>) =>
            api(`/api/transactions/${room.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    section: "NOTARY",
                    action,
                    notaryDetails: details,
                }),
            }),
        onSuccess: refresh,
    });
    const confirmProposal = () => {
        if (proposal) mutation.mutate({ ...proposal });
    };
    if (!isSale)
        return (
            <Panel
                title="Notaris en levering"
                description="Bij verhuur is geen notaris nodig voor de overdracht."
            >
                <div className="flex items-start gap-3 border border-line bg-background p-4 text-sm leading-6 text-muted">
                    <Landmark
                        className="mt-0.5 shrink-0 text-brand"
                        size={18}
                    />
                    <p>
                        Voor een huurovereenkomst is geen notaris vereist. De
                        ingangsdatum en overige afspraken worden vastgelegd in
                        de huurovereenkomst.
                    </p>
                </div>
            </Panel>
        );
    return (
        <div className="grid gap-5">
            <Panel
                title="Notaris en levering"
                description={
                    isSeller
                        ? "Je kunt een notaris voorstellen aan de koper. Alleen de koper bevestigt uiteindelijk de notaris."
                        : "Jij kiest en bevestigt de notaris. Een voorstel van de verkoper kun je direct bevestigen."
                }
            >
                {confirmed && (
                    <>
                        <div className="flex items-center gap-3 border border-brand/30 bg-brand/5 p-4 text-sm">
                            <CheckCircle2
                                className="shrink-0 text-brand"
                                size={20}
                            />
                            <div>
                                <p className="font-semibold">
                                    {confirmed.officeName}
                                </p>
                                <p className="text-xs text-muted">
                                    {isSeller
                                        ? "De koper heeft deze notaris bevestigd."
                                        : "Jij hebt deze notaris bevestigd."}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 border border-line p-4">
                            <NotaryDetailsGrid details={confirmed} />
                        </div>
                    </>
                )}

                {!confirmed && isSeller && proposal && (
                    <div className="mb-5 border border-line p-4 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                            Jouw voorstel
                        </p>
                        <NotaryDetailsGrid details={proposal} />
                        <p className="mt-3 text-xs text-muted">
                            De koper moet dit voorstel nog bevestigen of
                            wijzigen.
                        </p>
                    </div>
                )}
                {!confirmed && !isSeller && proposal && (
                    <div className="mb-5 border border-dashed border-brand/40 bg-background p-4 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                            Voorstel van de verkoper
                        </p>
                        <NotaryDetailsGrid details={proposal} />
                        {!closed && (
                            <button
                                onClick={confirmProposal}
                                disabled={mutation.isPending}
                                className="mt-4 inline-flex h-11 items-center gap-2 bg-brand px-4 font-semibold text-white"
                            >
                                <Check size={16} /> Bevestig dit voorstel
                            </button>
                        )}
                    </div>
                )}

                {!closed && (
                    <form
                        action={(form) =>
                            mutation.mutate(Object.fromEntries(form))
                        }
                        className={`grid gap-4 sm:grid-cols-2 ${confirmed || proposal ? "mt-6 border-t border-line pt-5" : ""}`}
                    >
                        <Field
                            name="officeName"
                            label="Notariskantoor"
                            defaultValue={
                                confirmed
                                    ? confirmed.officeName
                                    : (proposal?.officeName ?? "")
                            }
                            required
                        />
                        <Field
                            name="contactName"
                            label="Contactpersoon"
                            defaultValue={
                                confirmed
                                    ? confirmed.contactName
                                    : (proposal?.contactName ?? "")
                            }
                        />
                        <Field
                            name="email"
                            label="E-mailadres"
                            type="email"
                            defaultValue={
                                confirmed
                                    ? confirmed.email
                                    : (proposal?.email ?? "")
                            }
                        />
                        <Field
                            name="phone"
                            label="Telefoon"
                            defaultValue={
                                confirmed
                                    ? confirmed.phone
                                    : (proposal?.phone ?? "")
                            }
                        />
                        <Field
                            name="address"
                            label="Adres"
                            defaultValue={
                                confirmed
                                    ? confirmed.address
                                    : (proposal?.address ?? "")
                            }
                        />
                        <Field
                            name="reference"
                            label="Dossiernummer"
                            defaultValue={
                                confirmed
                                    ? confirmed.reference
                                    : (proposal?.reference ?? "")
                            }
                        />
                        <Field
                            name="clientAccountHolder"
                            label="Rekeninghouder (kwaliteitsrekening)"
                            defaultValue={
                                confirmed
                                    ? confirmed.clientAccountHolder
                                    : (proposal?.clientAccountHolder ?? "")
                            }
                        />
                        <Field
                            name="clientAccountIban"
                            label="IBAN (kwaliteitsrekening)"
                            defaultValue={
                                confirmed
                                    ? confirmed.clientAccountIban
                                    : (proposal?.clientAccountIban ?? "")
                            }
                        />
                        <button
                            disabled={mutation.isPending}
                            className="inline-flex h-12 items-center justify-center gap-2 bg-brand px-5 font-semibold text-white sm:col-span-2"
                        >
                            <Landmark size={17} />{" "}
                            {isSeller
                                ? "Stel notaris voor"
                                : "Bevestig notaris"}
                        </button>
                    </form>
                )}
                {mutation.error && (
                    <p className="mt-4 text-sm text-red-700">
                        {mutation.error.message}
                    </p>
                )}
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
                <Panel
                    title="Wat doet de notaris?"
                    description="De notaris is een onafhankelijke juridische dienstverlener die de eigendomsoverdracht controleert en bij de levering officieel vastlegt. Hij behartigt niet het belang van koper of verkoper, maar bewaakt de rechtsgeldigheid van de overdracht."
                >
                    <GuidanceList
                        items={[
                            "Controleert de identiteit en handelingsbekwaamheid van koper en verkoper (en een eventuele echtgenoot/partner).",
                            "Controleert de kadastrale gegevens en of er hypotheken, beslagen of andere inschrijvingen op de woning rusten.",
                            "Stelt de leveringsakte op en laat deze door beide partijen passeren (ondertekenen).",
                            "Zorgt dat de koopsom en een eventuele waarborgsom correct worden verdeeld.",
                            "Regelt de inschrijving van de eigendomsoverdracht in het Kadaster.",
                        ]}
                    />
                </Panel>
                <Panel
                    title="Wat moet je aanleveren?"
                    description="Zorg dat deze documenten en gegevens ruim vóór de leveringsdatum bij de notaris zijn om vertraging te voorkomen."
                >
                    <div className="grid gap-6 sm:grid-cols-2">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                Voor beide partijen
                            </p>
                            <div className="mt-3">
                                <GuidanceList
                                    items={[
                                        {
                                            title: "Geldig legitimatiebewijs",
                                            text: "ID-kaart of paspoort. Een rijbewijs wordt door de notaris niet geaccepteerd.",
                                        },
                                        {
                                            title: "Bankgegevens (IBAN)",
                                            text: "Voor de verrekening van de koopsom en een eventuele waarborgsom.",
                                        },
                                        {
                                            title: "Ondertekende koopovereenkomst",
                                            text: "De notaris gebruikt de koopakte als basis voor de leveringsakte.",
                                        },
                                        {
                                            title: "Volmacht (indien niet aanwezig)",
                                            text: "Kom je niet zelf naar het passeren, regel dan tijdig een ondertekende volmacht.",
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                {isSeller ? "Als verkoper" : "Als koper"}
                            </p>
                            <div className="mt-3">
                                <GuidanceList
                                    items={
                                        isSeller
                                            ? [
                                                  {
                                                      title: "Partnerinstemming (indien van toepassing)",
                                                      text: "Bij verkoop van een gezamenlijke woning is schriftelijke instemming van je echtgenoot/partner vereist (Art 1:88 BW). De notaris controleert dit bij het passeren.",
                                                  },
                                                  {
                                                      title: "Bevoegdheid tot verkoop",
                                                      text: "Bewijs dat je bevoegd bent de woning te verkopen, bijvoorbeeld als de woning op naam van meerdere personen of een vennootschap staat.",
                                                  },
                                                  {
                                                      title: "Openstaande hypotheek / beslag",
                                                      text: "Zorg dat openstaande inschrijvingen worden afgelost; de notaris regelt de verrekening bij de levering.",
                                                  },
                                                  {
                                                      title: "VvE-stukken (indien appartement)",
                                                      text: "De notaris kan de splitsingsakte en VvE-gegevens opvragen.",
                                                  },
                                              ]
                                            : [
                                                  {
                                                      title: "Bewijs van financiering",
                                                      text: "Bevestiging dat de koopsom (en eventuele borgsom) tijdig beschikbaar is.",
                                                  },
                                                  {
                                                      title: "Opdracht van je geldverstrekker",
                                                      text: "Bij een hypotheek stuurt de bank een opdracht naar de notaris; zorg dat dit tijdig is geregeld.",
                                                  },
                                                  {
                                                      title: "Partner / medekoper",
                                                      text: "Ben je gehuwd of koop je samen? Dan verschijnt je partner/medekoper mee bij het passeren.",
                                                  },
                                                  {
                                                      title: "NHG (indien van toepassing)",
                                                      text: "Bij een Nationale Hypotheek Garantie regelt de notaris het NHG-certificaat.",
                                                  },
                                              ]
                                    }
                                />
                            </div>
                        </div>
                    </div>
                    <p className="mt-5 text-xs leading-5 text-muted">
                        Vraag je notaris welke documenten in jouw situatie
                        precies nodig zijn; dit is een algemene richtlijn.
                    </p>
                </Panel>
            </div>

            <Panel
                title="Waar moet je op letten?"
                description="Enkele aandachtspunten om de overdracht soepel en zonder verrassingen te laten verlopen."
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <GuidanceItem
                        title="Vrijheid van notariskeuze"
                        text="Je bent niet verplicht de voorgestelde notaris te aanvaarden. Uiteindelijk kiest de koper de notaris die de akte passeert."
                    />
                    <GuidanceItem
                        title="Vraag vooraf naar de kosten"
                        text="Informeer naar honorarium, kadasterkosten en eventuele btw, en vraag om een offerte voordat je akkoord gaat."
                    />
                    <GuidanceItem
                        title="Controleer de gegevens vóór het passeren"
                        text="Zorg dat naam, adres, koopsom en voorwaarden kloppen. Wijzigen ná ondertekening kost tijd en geld."
                    />
                    <GuidanceItem
                        title="Neutrale begeleiding"
                        text="De notaris begeleidt neutraal en kan je niet als partij bijstaan. Voor juridisch advies over de koop kun je een aankoopmakelaar of advocaat raadplegen."
                    />
                    <GuidanceItem
                        title="Vraag om stukken voor de belastingaangifte"
                        text="Vraag de notaris om een afschrift van de leveringsakte en een specificatie van de betaalde kosten. Als koper heb je deze nodig voor de hypotheekrenteaftrek; vraag ook na of er andere verrekeningen of belastingteruggaven voor jou gelden."
                    />
                    {isSeller ? (
                        <GuidanceItem
                            title="Openstaande inschrijvingen"
                            text="Zorg dat er geen openstaande hypotheek of beslag op de woning rust die de levering kan blokkeren. De notaris controleert dit."
                        />
                    ) : (
                        <GuidanceItem
                            title="Bijzonderheden op de woning"
                            text="Vraag na of er erfdienstbaarheden of kwaliteitsrechten op de woning rusten en lees de kadastrale gegevens goed door."
                        />
                    )}
                </div>
            </Panel>
        </div>
    );
}

function Handover({
    room,
    closed,
    refresh,
}: {
    room: Room;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const current = room.handoverDetails ?? {};
    const mutation = useMutation({
        mutationFn: (form: FormData) =>
            api(`/api/transactions/${room.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    section: "HANDOVER",
                    handoverDetails: Object.fromEntries(form),
                }),
            }),
        onSuccess: refresh,
    });
    const finish = useMutation({
        mutationFn: () =>
            api(`/api/transactions/${room.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    section: "STATUS",
                    status: "COMPLETED",
                }),
            }),
        onSuccess: refresh,
    });
    return (
        <div className="grid gap-5 lg:grid-cols-[1fr_0.6fr]">
            <Panel
                title="Eindinspectie en meterstanden"
                description="Registreer de feitelijke oplevering voordat de transactie wordt afgesloten."
            >
                <form
                    action={(form) => mutation.mutate(form)}
                    className="grid gap-4 sm:grid-cols-2"
                >
                    <Field
                        name="inspectedAt"
                        label="Inspectiedatum"
                        type="datetime-local"
                        defaultValue={
                            current.inspectedAt
                                ? String(current.inspectedAt).slice(0, 16)
                                : ""
                        }
                        disabled={closed}
                    />
                    <Field
                        name="keyCount"
                        label="Aantal sleutels"
                        type="number"
                        defaultValue={current.keyCount}
                        disabled={closed}
                    />
                    <Field
                        name="electricityMeter"
                        label="Elektriciteitsmeter"
                        defaultValue={current.electricityMeter}
                        disabled={closed}
                    />
                    <Field
                        name="gasMeter"
                        label="Gasmeter"
                        defaultValue={current.gasMeter}
                        disabled={closed}
                    />
                    <Field
                        name="waterMeter"
                        label="Watermeter"
                        defaultValue={current.waterMeter}
                        disabled={closed}
                    />
                    <label className="text-sm font-semibold sm:col-span-2">
                        Opmerkingen
                        <textarea
                            name="notes"
                            defaultValue={String(current.notes ?? "")}
                            rows={4}
                            className="input mt-2 py-3"
                            disabled={closed}
                        />
                    </label>
                    {!closed && (
                        <button
                            disabled={mutation.isPending}
                            className="inline-flex h-12 items-center justify-center gap-2 bg-brand px-5 font-semibold text-white sm:col-span-2"
                        >
                            <KeyRound size={17} /> Oplevering opslaan
                        </button>
                    )}
                </form>
            </Panel>
            <Panel
                title="Transactie afronden"
                description="Afronden markeert de woning als verkocht of verhuurd."
            >
                <div className="grid gap-3 text-sm">
                    <Requirement
                        label="Verkoper heeft contract bevestigd"
                        done={Boolean(room.sellerContractConfirmedAt)}
                    />
                    <Requirement
                        label="Koper heeft contract bevestigd"
                        done={Boolean(room.buyerContractConfirmedAt)}
                    />
                    <Requirement
                        label="Notaris vastgelegd"
                        done={Boolean(room.notaryDetails)}
                    />
                    <Requirement
                        label="Oplevering ingevuld"
                        done={Boolean(room.handoverDetails)}
                    />
                </div>
                {!closed && (
                    <button
                        onClick={() => finish.mutate()}
                        disabled={finish.isPending}
                        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 bg-brand-dark px-5 font-semibold text-white"
                    >
                        <Handshake size={18} /> Overdracht afronden
                    </button>
                )}
                {finish.error && (
                    <p className="mt-4 text-sm text-red-700">
                        {finish.error.message}
                    </p>
                )}
                {room.status === "COMPLETED" && (
                    <p className="mt-5 inline-flex items-center gap-2 font-semibold text-brand">
                        <CheckCircle2 size={19} /> Transactie afgerond
                    </p>
                )}
            </Panel>
        </div>
    );
}
function Requirement({ label, done }: { label: string; done: boolean }) {
    return (
        <div className="flex items-center gap-2">
            {done ? (
                <CheckCircle2 className="text-brand" size={17} />
            ) : (
                <Clock3 className="text-muted" size={17} />
            )}
            <span>{label}</span>
        </div>
    );
}
function Field({
    name,
    label,
    type = "text",
    defaultValue,
    required,
    disabled,
}: {
    name: string;
    label: string;
    type?: string;
    defaultValue?: unknown;
    required?: boolean;
    disabled?: boolean;
}) {
    return (
        <label className="text-sm font-semibold">
            {label}
            <input
                name={name}
                type={type}
                defaultValue={
                    defaultValue === undefined || defaultValue === null
                        ? ""
                        : String(defaultValue)
                }
                required={required}
                disabled={disabled}
                className="input mt-2"
            />
        </label>
    );
}

function Documents({
    room,
    closed,
    refresh,
}: {
    room: Room;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const [category, setCategory] = useState("OTHER");
    const [file, setFile] = useState<File | null>(null);
    const mutation = useMutation({
        mutationFn: async () => {
            const form = new FormData();
            form.set("file", file!);
            form.set("category", category);
            return api(`/api/transactions/${room.id}/documents`, {
                method: "POST",
                body: form,
            });
        },
        onSuccess: async () => {
            setFile(null);
            await refresh();
        },
    });
    return (
        <Panel
            title="Beveiligde documentkluis"
            description="Documenten zijn niet publiek bereikbaar en worden met SHA-256 gecontroleerd."
        >
            {!closed && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (file) mutation.mutate();
                    }}
                    className="grid gap-3 border border-dashed border-brand/30 bg-background p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end"
                >
                    <label className="text-sm font-semibold">
                        Document
                        <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            onChange={(event) =>
                                setFile(event.target.files?.[0] ?? null)
                            }
                            className="mt-2 block w-full text-sm"
                            required
                        />
                    </label>
                    <label className="text-sm font-semibold">
                        Categorie
                        <select
                            value={category}
                            onChange={(event) =>
                                setCategory(event.target.value)
                            }
                            className="input mt-2"
                        >
                            {Object.entries(documentNames)
                                .filter(([key]) => key !== "CHAT_ATTACHMENT")
                                .map(([key, label]) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <button
                        disabled={mutation.isPending || !file}
                        className="inline-flex h-12 items-center justify-center gap-2 bg-brand px-5 text-sm font-semibold text-white"
                    >
                        <Upload size={16} /> Uploaden
                    </button>
                </form>
            )}
            {mutation.error && (
                <p className="mt-4 text-sm text-red-700">
                    {mutation.error.message}
                </p>
            )}
            <div className="mt-6 divide-y divide-line">
                {room.documents.length ? (
                    room.documents.map((document) => (
                        <DocumentRow
                            key={document.id}
                            roomId={room.id}
                            document={document}
                        />
                    ))
                ) : (
                    <p className="py-8 text-center text-sm text-muted">
                        Nog geen documenten uitgewisseld.
                    </p>
                )}
            </div>
        </Panel>
    );
}
function DocumentRow({
    roomId,
    document,
}: {
    roomId: string;
    document: DocumentItem;
}) {
    return (
        <div className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
            <span className="grid size-10 shrink-0 place-items-center bg-background text-brand">
                <FileText size={19} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{document.fileName}</p>
                <p className="mt-1 text-xs text-muted">
                    {documentNames[document.category]} ·{" "}
                    {(Number(document.sizeBytes) / 1024 / 1024).toFixed(1)} MB ·{" "}
                    {document.uploadedBy.name}
                </p>
            </div>
            <a
                href={`/api/transactions/${roomId}/documents/${document.id}`}
                className="grid size-10 shrink-0 place-items-center border border-line text-brand"
                aria-label={`${document.fileName} downloaden`}
            >
                <Download size={17} />
            </a>
        </div>
    );
}

function Chat({
    room,
    currentUserId,
    closed,
    refresh,
}: {
    room: Room;
    currentUserId: string;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const [body, setBody] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [room.messages.length]);
    const mutation = useMutation({
        mutationFn: async () => {
            const message = await api<Message>(
                `/api/transactions/${room.id}/messages`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        body: body || (file ? `Bijlage: ${file.name}` : ""),
                    }),
                },
            );
            if (file) {
                const form = new FormData();
                form.set("file", file);
                form.set("category", "CHAT_ATTACHMENT");
                form.set("messageId", message.id);
                await api(`/api/transactions/${room.id}/documents`, {
                    method: "POST",
                    body: form,
                });
            }
        },
        onSuccess: async () => {
            setBody("");
            setFile(null);
            await refresh();
        },
    });
    return (
        <Panel
            title="Chat tussen koper en verkoper"
            description="Berichten en bijlagen blijven gekoppeld aan deze transactie."
        >
            <div className="max-h-130 min-h-80 space-y-3 overflow-y-auto bg-background p-4">
                {room.messages.map((message) => {
                    const own = message.authorUserId === currentUserId;
                    if (message.kind === "SYSTEM")
                        return (
                            <div
                                key={message.id}
                                className="mx-auto max-w-lg border border-brand/15 bg-surface px-4 py-3 text-center text-xs text-muted"
                            >
                                <ShieldCheck
                                    className="mr-1 inline text-brand"
                                    size={14}
                                />{" "}
                                {message.body}
                            </div>
                        );
                    return (
                        <div
                            key={message.id}
                            className={`flex ${own ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[85%] p-3 text-sm sm:max-w-[70%] ${own ? "bg-brand text-white" : "border border-line bg-surface"}`}
                            >
                                <p
                                    className={`mb-1 text-[11px] font-semibold ${own ? "text-white/70" : "text-muted"}`}
                                >
                                    {message.author.name}
                                </p>
                                <p className="whitespace-pre-wrap leading-6">
                                    {message.body}
                                </p>
                                {message.documents.map((document) => (
                                    <a
                                        key={document.id}
                                        href={`/api/transactions/${room.id}/documents/${document.id}`}
                                        className={`mt-3 flex items-center gap-2 border p-2 text-xs font-semibold ${own ? "border-white/30" : "border-line text-brand"}`}
                                    >
                                        <Paperclip size={14} />
                                        <span className="truncate">
                                            {document.fileName}
                                        </span>
                                        <Download
                                            className="ml-auto"
                                            size={14}
                                        />
                                    </a>
                                ))}
                                <p
                                    className={`mt-2 text-right text-[10px] ${own ? "text-white/60" : "text-muted"}`}
                                >
                                    {new Date(message.createdAt).toLocaleString(
                                        "nl-NL",
                                        {
                                            day: "2-digit",
                                            month: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        },
                                    )}
                                </p>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>
            {!closed && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (body.trim() || file) mutation.mutate();
                    }}
                    className="mt-3 border border-line p-3"
                >
                    <textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="Schrijf een bericht…"
                        className="w-full resize-none bg-transparent text-sm outline-none"
                    />
                    {file && (
                        <div className="mb-2 flex items-center gap-2 bg-background p-2 text-xs">
                            <Paperclip size={14} />
                            <span className="truncate">{file.name}</span>
                            <button
                                type="button"
                                onClick={() => setFile(null)}
                                className="ml-auto"
                                aria-label="Bijlage verwijderen"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <label
                            className="grid size-10 cursor-pointer place-items-center border border-line text-brand"
                            title="Document toevoegen"
                        >
                            <Paperclip size={17} />
                            <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                onChange={(event) =>
                                    setFile(event.target.files?.[0] ?? null)
                                }
                                className="hidden"
                            />
                        </label>
                        <button
                            disabled={
                                mutation.isPending || (!body.trim() && !file)
                            }
                            className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-semibold text-white"
                        >
                            {mutation.isPending ? (
                                <LoaderCircle
                                    className="animate-spin"
                                    size={16}
                                />
                            ) : (
                                <Send size={16} />
                            )}{" "}
                            Versturen
                        </button>
                    </div>
                </form>
            )}
            {mutation.error && (
                <p className="mt-3 text-sm text-red-700">
                    {mutation.error.message}
                </p>
            )}
        </Panel>
    );
}
