"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    CalendarDays,
    CalendarClock,
    Clock3,
    Info,
    LoaderCircle,
    Pencil,
    Trash2,
    Users,
    X,
} from "lucide-react";

type ViewingSlot = {
    id: string;
    type: "APPOINTMENT" | "OPEN_HOUSE";
    startsAt: string;
    endsAt: string;
    publishedAt: string;
    capacity: number;
    bookings: Array<{
        id: string;
        user: { id: string; name: string; email: string };
    }>;
};

type SlotDraft = {
    type: ViewingSlot["type"];
    startsAt: string;
    endsAt: string;
    publicationMode: "DIRECT" | "SCHEDULED";
    publishedAt: string;
    capacity: string;
};

type PropertyType =
    | "HOUSE"
    | "APARTMENT"
    | "PARKING"
    | "LAND"
    | "COMMERCIAL"
    | "OTHER";

const durationAdvice: Record<
    PropertyType,
    { label: string; appointmentMinutes: number; openHouseMinutes: number }
> = {
    HOUSE: { label: "huis", appointmentMinutes: 45, openHouseMinutes: 120 },
    APARTMENT: {
        label: "appartement",
        appointmentMinutes: 30,
        openHouseMinutes: 90,
    },
    PARKING: {
        label: "parkeerplaats",
        appointmentMinutes: 15,
        openHouseMinutes: 60,
    },
    LAND: { label: "perceel", appointmentMinutes: 30, openHouseMinutes: 90 },
    COMMERCIAL: {
        label: "bedrijfspand",
        appointmentMinutes: 60,
        openHouseMinutes: 150,
    },
    OTHER: { label: "object", appointmentMinutes: 30, openHouseMinutes: 90 },
};

const emptyDraft: SlotDraft = {
    type: "APPOINTMENT",
    startsAt: "",
    endsAt: "",
    publicationMode: "DIRECT",
    publishedAt: "",
    capacity: "10",
};

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error?.message ?? "De aanvraag is mislukt");
    }
    return payload.data as T;
}

function toLocalInput(value: string) {
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
});

export function ViewingPlanner({
    listingId,
    propertyType,
    listingStatus,
}: {
    listingId: string;
    propertyType: PropertyType;
    listingStatus: string;
}) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<SlotDraft>(emptyDraft);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showAdvice, setShowAdvice] = useState(false);
    const queryKey = ["listing-viewings", listingId];
    const advice = durationAdvice[propertyType];

    const slots = useQuery({
        queryKey,
        queryFn: () =>
            requestData<ViewingSlot[]>(`/api/listings/${listingId}/viewings`),
    });

    const save = useMutation({
        mutationFn: () => {
            const body = JSON.stringify({
                type: draft.type,
                startsAt: new Date(draft.startsAt).toISOString(),
                endsAt: new Date(draft.endsAt).toISOString(),
                publishedAt:
                    draft.publicationMode === "DIRECT"
                        ? new Date().toISOString()
                        : new Date(draft.publishedAt).toISOString(),
                capacity:
                    draft.type === "APPOINTMENT" ? 1 : Number(draft.capacity),
            });
            return requestData<ViewingSlot>(
                editingId
                    ? `/api/listings/${listingId}/viewings/${editingId}`
                    : `/api/listings/${listingId}/viewings`,
                {
                    method: editingId ? "PATCH" : "POST",
                    headers: { "content-type": "application/json" },
                    body,
                },
            );
        },
        async onSuccess() {
            setDraft(emptyDraft);
            setEditingId(null);
            await queryClient.invalidateQueries({ queryKey });
        },
    });

    const remove = useMutation({
        mutationFn: async (slotId: string) => {
            const response = await fetch(
                `/api/listings/${listingId}/viewings/${slotId}`,
                { method: "DELETE" },
            );
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(
                    payload.error?.message ?? "Verwijderen is mislukt",
                );
            }
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });

    function submit(event: FormEvent) {
        event.preventDefault();
        save.mutate();
    }

    function edit(slot: ViewingSlot) {
        setEditingId(slot.id);
        setDraft({
            type: slot.type,
            startsAt: toLocalInput(slot.startsAt),
            endsAt: toLocalInput(slot.endsAt),
            publicationMode:
                new Date(slot.publishedAt) > new Date()
                    ? "SCHEDULED"
                    : "DIRECT",
            publishedAt: toLocalInput(slot.publishedAt),
            capacity: String(slot.capacity),
        });
    }

    return (
        <div>
            <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-brand-dark">
                    <CalendarDays size={21} />
                </span>
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-semibold">
                            Bezichtigingen
                        </h2>
                        <button
                            type="button"
                            aria-label="Toon advies over de duur van een bezichtiging"
                            aria-expanded={showAdvice}
                            onClick={() => setShowAdvice((current) => !current)}
                            className="grid size-8 place-items-center text-brand"
                            title="Advies over de duur"
                        >
                            <Info size={18} />
                        </button>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted">
                        Plan losse afspraken of een open huis. Tijdstippen met
                        boekingen blijven ongewijzigd.
                    </p>
                </div>
            </div>

            {showAdvice ? (
                <div className="mt-5 border-l-4 border-brand bg-background p-4 text-sm leading-6">
                    Voor een {advice.label} adviseren we ongeveer{" "}
                    <strong>{advice.appointmentMinutes} minuten</strong> per
                    losse bezichtiging. Reserveer voor een open huis ongeveer{" "}
                    <strong>{advice.openHouseMinutes} minuten</strong>. Voeg
                    extra tijd toe voor vragen, uitloop en wisseling van
                    bezoekers.
                </div>
            ) : null}

            <form onSubmit={submit} className="mt-8 border-t border-line pt-7">
                <div className="grid gap-5 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                        Type
                        <select
                            value={draft.type}
                            onChange={(event) =>
                                setDraft((current) => ({
                                    ...current,
                                    type: event.target
                                        .value as SlotDraft["type"],
                                }))
                            }
                            className="input mt-2"
                        >
                            <option value="APPOINTMENT">Losse afspraak</option>
                            <option value="OPEN_HOUSE">Open huis</option>
                        </select>
                    </label>
                    {draft.type === "OPEN_HOUSE" ? (
                        <label className="text-sm font-semibold">
                            Maximum aantal bezoekers
                            <input
                                required
                                type="number"
                                min="1"
                                max="100"
                                value={draft.capacity}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        capacity: event.target.value,
                                    }))
                                }
                                className="input mt-2"
                            />
                        </label>
                    ) : (
                        <div />
                    )}
                    <label className="text-sm font-semibold">
                        Start
                        <input
                            required
                            type="datetime-local"
                            value={draft.startsAt}
                            onChange={(event) =>
                                setDraft((current) => ({
                                    ...current,
                                    startsAt: event.target.value,
                                }))
                            }
                            className="input mt-2"
                        />
                    </label>
                    <label className="text-sm font-semibold">
                        Einde
                        <input
                            required
                            type="datetime-local"
                            value={draft.endsAt}
                            onChange={(event) =>
                                setDraft((current) => ({
                                    ...current,
                                    endsAt: event.target.value,
                                }))
                            }
                            className="input mt-2"
                        />
                    </label>
                    <fieldset className="sm:col-span-2">
                        <legend className="text-sm font-semibold">
                            Publiceren
                        </legend>
                        <div className="mt-2 grid grid-cols-2 border border-line p-1">
                            {[
                                ["DIRECT", "Direct zichtbaar"],
                                ["SCHEDULED", "Inplannen"],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() =>
                                        setDraft((current) => ({
                                            ...current,
                                            publicationMode:
                                                value as SlotDraft["publicationMode"],
                                        }))
                                    }
                                    className={`min-h-10 px-3 text-sm font-semibold ${draft.publicationMode === value ? "bg-brand text-white" : "text-muted"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    {draft.publicationMode === "SCHEDULED" ? (
                        <label className="text-sm font-semibold sm:col-span-2">
                            Zichtbaar vanaf
                            <input
                                required
                                type="datetime-local"
                                min={toLocalInput(new Date().toISOString())}
                                max={draft.startsAt || undefined}
                                value={draft.publishedAt}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        publishedAt: event.target.value,
                                    }))
                                }
                                className="input mt-2"
                            />
                        </label>
                    ) : null}
                </div>
                {save.error ? (
                    <p className="mt-4 bg-red-50 p-4 text-sm text-red-700">
                        {save.error.message}
                    </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-3">
                    <button
                        disabled={save.isPending}
                        className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                        {save.isPending ? (
                            <LoaderCircle size={17} className="animate-spin" />
                        ) : (
                            <CalendarDays size={17} />
                        )}
                        {editingId ? "Wijziging opslaan" : "Tijdstip toevoegen"}
                    </button>
                    {editingId ? (
                        <button
                            type="button"
                            onClick={() => {
                                setEditingId(null);
                                setDraft(emptyDraft);
                            }}
                            className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 text-sm font-semibold"
                        >
                            <X size={17} /> Annuleren
                        </button>
                    ) : null}
                </div>
            </form>

            <div className="mt-9 border-t border-line pt-7">
                <h3 className="font-semibold">Geplande momenten</h3>
                {slots.isLoading ? (
                    <LoaderCircle className="mt-5 animate-spin text-brand" />
                ) : slots.error ? (
                    <p className="mt-4 bg-red-50 p-4 text-sm text-red-700">
                        {slots.error.message}
                    </p>
                ) : slots.data?.length ? (
                    <div className="mt-4 divide-y divide-line border-y border-line">
                        {slots.data.map((slot) => {
                            const booked = slot.bookings.length > 0;
                            return (
                                <div key={slot.id} className="py-5">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div>
                                            <p className="font-semibold">
                                                {slot.type === "OPEN_HOUSE"
                                                    ? "Open huis"
                                                    : "Losse afspraak"}
                                            </p>
                                            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                                                <Clock3 size={15} />
                                                {dateFormatter.format(
                                                    new Date(slot.startsAt),
                                                )}
                                                {" - "}
                                                {new Intl.DateTimeFormat(
                                                    "nl-NL",
                                                    {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    },
                                                ).format(new Date(slot.endsAt))}
                                            </p>
                                            <p className="mt-2 flex items-center gap-2 text-sm">
                                                <Users
                                                    size={15}
                                                    className="text-brand"
                                                />
                                                {slot.bookings.length} van{" "}
                                                {slot.capacity} geboekt
                                            </p>
                                            <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                                                <CalendarClock size={15} />
                                                {new Date(slot.publishedAt) <=
                                                new Date()
                                                    ? listingStatus === "LIVE"
                                                        ? "Zichtbaar voor woningzoekers"
                                                        : "Wordt zichtbaar zodra de advertentie live staat"
                                                    : `Zichtbaar vanaf ${dateFormatter.format(new Date(slot.publishedAt))}${listingStatus === "LIVE" ? "" : ", zodra de advertentie live staat"}`}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                title={
                                                    booked
                                                        ? "Geboekte momenten kunnen niet worden gewijzigd"
                                                        : "Wijzigen"
                                                }
                                                disabled={booked}
                                                onClick={() => edit(slot)}
                                                className="grid size-10 place-items-center border border-line text-brand disabled:cursor-not-allowed disabled:opacity-35"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                title={
                                                    booked
                                                        ? "Geboekte momenten kunnen niet worden verwijderd"
                                                        : "Verwijderen"
                                                }
                                                disabled={
                                                    booked || remove.isPending
                                                }
                                                onClick={() =>
                                                    remove.mutate(slot.id)
                                                }
                                                className="grid size-10 place-items-center border border-line text-red-700 disabled:cursor-not-allowed disabled:opacity-35"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    {booked ? (
                                        <div className="mt-4 grid gap-2 bg-background p-4 text-sm sm:grid-cols-2">
                                            {slot.bookings.map((booking) => (
                                                <div key={booking.id}>
                                                    <p className="font-semibold">
                                                        {booking.user.name}
                                                    </p>
                                                    <a
                                                        className="text-brand"
                                                        href={`mailto:${booking.user.email}`}
                                                    >
                                                        {booking.user.email}
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="mt-4 text-sm text-muted">
                        Er zijn nog geen bezichtigingen gepland.
                    </p>
                )}
                {remove.error ? (
                    <p className="mt-4 bg-red-50 p-4 text-sm text-red-700">
                        {remove.error.message}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
