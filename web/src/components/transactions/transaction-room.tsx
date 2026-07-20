"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowLeft,
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
    Paperclip,
    Send,
    ShieldCheck,
    Upload,
    X,
} from "lucide-react";

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
    notaryDetails: Record<string, string> | null;
    handoverDetails: Record<string, string | number> | null;
    listing: {
        publicSlug: string | null;
        purpose: string;
        property: {
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
};
type PassportVersion = {
    id: string;
    version: number;
    completenessScore: number;
    entryHash: string;
    previousHash: string | null;
    createdAt: string;
    snapshot: { changeNote?: string };
};

const tabs = [
    ["overview", "Voortgang", CheckCircle2],
    ["passport", "Woningpaspoort", ShieldCheck],
    ["contract", "Contract", FileCheck2],
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
    NOTARY: "Notaris",
    FINAL_INSPECTION: "Eindinspectie",
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
}: {
    initialRoom: Room;
    currentUserId: string;
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
            api<PassportVersion[]>(
                `/api/transactions/${initialRoom.id}/passport`,
            ),
    });
    const room = roomQuery.data;
    const isSeller = room.sellerUserId === currentUserId;
    const closed = room.status === "COMPLETED" || room.status === "CANCELLED";
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
        (item) => item.status === "COMPLETED" || item.status === "WAIVED",
    ).length;
    const progress = Math.round((completed / room.milestones.length) * 100);
    return (
        <div className="-mx-1 pb-20">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <Link
                        href="/dashboard/transacties"
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
                <div className="flex items-center gap-3 border border-line bg-white px-4 py-3">
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
                {tabs.map(([id, label, Icon]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${tab === id ? "border-brand text-brand" : "border-transparent text-muted"}`}
                    >
                        <Icon size={16} /> {label}
                    </button>
                ))}
            </div>
            <div className="mt-6">
                {tab === "overview" && (
                    <Overview room={room} closed={closed} refresh={refresh} />
                )}
                {tab === "passport" && (
                    <Passport
                        room={room}
                        versions={passportQuery.data ?? []}
                        isSeller={isSeller}
                        closed={closed}
                        refresh={refresh}
                    />
                )}
                {tab === "contract" && (
                    <Contract
                        room={room}
                        currentUserId={currentUserId}
                        closed={closed}
                        refresh={refresh}
                    />
                )}
                {tab === "notary" && (
                    <Notary room={room} closed={closed} refresh={refresh} />
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
        <section className="border border-line bg-white p-5 sm:p-7">
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

function Overview({
    room,
    closed,
    refresh,
}: {
    room: Room;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const mutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            api(`/api/transactions/${room.id}/milestones/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status }),
            }),
        onSuccess: refresh,
    });
    return (
        <div className="grid gap-5 lg:grid-cols-[1.45fr_0.55fr]">
            <Panel
                title="Stappen naar de overdracht"
                description="Werk elke stap af. Deadlines en wijzigingen zijn voor beide partijen zichtbaar."
            >
                <div className="divide-y divide-line">
                    {room.milestones.map((item, index) => {
                        const done =
                            item.status === "COMPLETED" ||
                            item.status === "WAIVED";
                        const overdue =
                            item.dueAt &&
                            new Date(item.dueAt) < new Date() &&
                            !done;
                        return (
                            <div
                                key={item.id}
                                className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                            >
                                <button
                                    disabled={closed || mutation.isPending}
                                    onClick={() =>
                                        mutation.mutate({
                                            id: item.id,
                                            status: done
                                                ? "IN_PROGRESS"
                                                : "COMPLETED",
                                        })
                                    }
                                    className={`grid size-9 shrink-0 place-items-center rounded-full border ${done ? "border-brand bg-brand text-white" : "border-line text-muted"}`}
                                    aria-label={`${item.title} ${done ? "heropenen" : "afronden"}`}
                                >
                                    {done ? (
                                        <Check size={17} />
                                    ) : (
                                        <span className="text-xs font-semibold">
                                            {index + 1}
                                        </span>
                                    )}
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p
                                        className={`font-semibold ${done ? "text-muted line-through" : ""}`}
                                    >
                                        {item.title}
                                    </p>
                                    <p
                                        className={`mt-1 text-xs ${overdue ? "text-red-700" : "text-muted"}`}
                                    >
                                        {item.status === "WAIVED"
                                            ? "Niet van toepassing"
                                            : item.dueAt
                                              ? `${overdue ? "Deadline verstreken" : "Deadline"}: ${new Date(item.dueAt).toLocaleDateString("nl-NL")}`
                                              : done
                                                ? `Afgerond ${item.completedAt ? new Date(item.completedAt).toLocaleDateString("nl-NL") : ""}`
                                                : "Nog geen deadline"}
                                    </p>
                                </div>
                                {!done && !closed && (
                                    <button
                                        onClick={() =>
                                            mutation.mutate({
                                                id: item.id,
                                                status: "WAIVED",
                                            })
                                        }
                                        className="text-xs font-semibold text-muted hover:text-brand"
                                    >
                                        N.v.t.
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
                {mutation.error && (
                    <p className="mt-4 text-sm text-red-700">
                        {mutation.error.message}
                    </p>
                )}
            </Panel>
            <div className="grid content-start gap-5">
                <Panel title="Partijen">
                    <div className="grid gap-4 text-sm">
                        <Person label="Verkoper" person={room.seller} />
                        <Person label="Koper" person={room.buyer} />
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
                            href={`/woning/${room.listing.publicSlug}`}
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

function Passport({
    room,
    versions,
    isSeller,
    closed,
    refresh,
}: {
    room: Room;
    versions: PassportVersion[];
    isSeller: boolean;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const [changeNote, setChangeNote] = useState("");
    const mutation = useMutation({
        mutationFn: () =>
            api(`/api/transactions/${room.id}/passport`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ changeNote }),
            }),
        onSuccess: async () => {
            setChangeNote("");
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
        onSuccess: refresh,
    });
    const latest = versions[0];
    return (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel
                title="Verifieerbaar woningpaspoort"
                description="Een momentopname van alle woninggegevens en documentvingerafdrukken bij deze transactie."
            >
                {latest ? (
                    <>
                        <div className="grid place-items-center bg-background p-7 text-center">
                            <div className="grid size-16 place-items-center rounded-full bg-brand text-white">
                                <ShieldCheck size={30} />
                            </div>
                            <p className="mt-4 text-3xl font-semibold">
                                {latest.completenessScore}%
                            </p>
                            <p className="text-sm text-muted">
                                dossier compleet
                            </p>
                        </div>
                        <div className="mt-5 grid gap-3 text-sm">
                            <Info
                                label="Huidige versie"
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
                        <button
                            onClick={() => pdfMutation.mutate()}
                            disabled={pdfMutation.isPending}
                            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 border border-brand text-sm font-semibold text-brand"
                        >
                            <Download size={16} /> PDF in documentkluis zetten
                        </button>
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
                title="Versiegeschiedenis"
                description="Elke versie verwijst naar de vorige. Daardoor worden latere wijzigingen aantoonbaar."
            >
                {isSeller && !closed && (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            mutation.mutate();
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
                            disabled={mutation.isPending}
                            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-brand px-5 text-sm font-semibold text-white"
                        >
                            <ShieldCheck size={16} /> Nieuwe versie
                        </button>
                    </form>
                )}
                {mutation.error && (
                    <p className="mb-4 text-sm text-red-700">
                        {mutation.error.message}
                    </p>
                )}
                <div className="grid gap-3">
                    {versions.map((version) => (
                        <div
                            key={version.id}
                            className="flex gap-4 border border-line p-4"
                        >
                            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-background font-semibold text-brand">
                                v{version.version}
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold">
                                        {version.snapshot.changeNote ??
                                            (version.version === 1
                                                ? "Dossier bij bodacceptatie"
                                                : "Nieuwe dossiermomentopname")}
                                    </p>
                                    <span className="text-xs text-muted">
                                        {version.completenessScore}% compleet
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-muted">
                                    {new Date(version.createdAt).toLocaleString(
                                        "nl-NL",
                                    )}
                                </p>
                                <p className="mt-2 truncate font-mono text-[10px] text-muted">
                                    {version.entryHash}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </Panel>
        </div>
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
                title="Afspraken voor de koopovereenkomst"
                description="Deze gestructureerde afspraken vormen het overdrachtsdossier voor de uiteindelijke overeenkomst en notaris."
            >
                <div className="grid gap-5">
                    <Info
                        label="Geaccepteerde koopsom"
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
                        Waarborgsom / bankgarantie (€)
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
                        role="Verkoper"
                        date={room.sellerContractConfirmedAt}
                    />
                    <Confirmation
                        label={room.buyer.name}
                        role="Koper"
                        date={room.buyerContractConfirmedAt}
                    />
                </div>
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

function Notary({
    room,
    closed,
    refresh,
}: {
    room: Room;
    closed: boolean;
    refresh: () => Promise<void>;
}) {
    const current = room.notaryDetails ?? {};
    const mutation = useMutation({
        mutationFn: (form: FormData) =>
            api(`/api/transactions/${room.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    section: "NOTARY",
                    notaryDetails: Object.fromEntries(form),
                }),
            }),
        onSuccess: refresh,
    });
    return (
        <Panel
            title="Notaris en levering"
            description="Leg de gekozen notaris en dossierreferentie vast. Beide partijen zien dezelfde gegevens."
        >
            <form
                action={(form) => mutation.mutate(form)}
                className="grid gap-4 sm:grid-cols-2"
            >
                <Field
                    name="officeName"
                    label="Notariskantoor"
                    defaultValue={current.officeName}
                    required
                    disabled={closed}
                />
                <Field
                    name="contactName"
                    label="Contactpersoon"
                    defaultValue={current.contactName}
                    disabled={closed}
                />
                <Field
                    name="email"
                    label="E-mailadres"
                    type="email"
                    defaultValue={current.email}
                    disabled={closed}
                />
                <Field
                    name="phone"
                    label="Telefoon"
                    defaultValue={current.phone}
                    disabled={closed}
                />
                <Field
                    name="address"
                    label="Adres"
                    defaultValue={current.address}
                    disabled={closed}
                />
                <Field
                    name="reference"
                    label="Dossiernummer"
                    defaultValue={current.reference}
                    disabled={closed}
                />
                {!closed && (
                    <button
                        disabled={mutation.isPending}
                        className="inline-flex h-12 items-center justify-center gap-2 bg-brand px-5 font-semibold text-white sm:col-span-2"
                    >
                        <Landmark size={17} /> Notarisgegevens opslaan
                    </button>
                )}
            </form>
            {mutation.error && (
                <p className="mt-4 text-sm text-red-700">
                    {mutation.error.message}
                </p>
            )}
        </Panel>
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
                                className="mx-auto max-w-lg border border-brand/15 bg-white px-4 py-3 text-center text-xs text-muted"
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
                                className={`max-w-[85%] p-3 text-sm sm:max-w-[70%] ${own ? "bg-brand text-white" : "border border-line bg-white"}`}
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
