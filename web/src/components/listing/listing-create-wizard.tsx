"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Home,
    LoaderCircle,
    MapPin,
    Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { PropertyData } from "@/lib/schemas/property";

type DraftAddress = {
    postcode: string;
    houseNumber: string;
    addition: string;
    street: string;
    city: string;
};

async function parseResponse(response: Response) {
    const payload = await response.json();
    if (!response.ok)
        throw new Error(payload.error?.message ?? "De aanvraag is mislukt");
    return payload.data;
}

export function ListingCreateWizard() {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2>(1);
    const [address, setAddress] = useState<DraftAddress>({
        postcode: "",
        houseNumber: "",
        addition: "",
        street: "",
        city: "",
    });
    const [propertyData, setPropertyData] = useState<PropertyData | null>(null);
    const [lookupError, setLookupError] = useState("");

    const lookup = useMutation({
        mutationFn: async () => {
            const query = new URLSearchParams({
                postcode: address.postcode,
                houseNumber: address.houseNumber,
            });
            if (address.addition) query.set("addition", address.addition);
            return parseResponse(await fetch(`/api/property-data?${query}`));
        },
        onSuccess(data: PropertyData) {
            setPropertyData(data);
            setAddress((current) => ({
                ...current,
                street: data.address.street,
                city: data.address.city,
            }));
            setLookupError("");
            setStep(2);
        },
        onError(error) {
            setLookupError(
                error instanceof Error ? error.message : "Adres niet gevonden",
            );
        },
    });

    const createListing = useMutation({
        mutationFn: async (form: FormData) => {
            const number = Number(address.houseNumber);
            const input = {
                purpose: form.get("purpose"),
                propertyType: form.get("propertyType"),
                postcode: address.postcode,
                houseNumber: number,
                houseNumberAddition: address.addition || null,
                street: propertyData?.address.street ?? address.street,
                city: propertyData?.address.city ?? address.city,
                municipality: propertyData?.address.municipality ?? null,
                province: propertyData?.address.province ?? null,
                bagAddressId: propertyData?.bagAddressId ?? null,
                bagBuildingId: propertyData?.bagBuildingId ?? null,
                cadastralParcelId: propertyData?.cadastralParcelId ?? null,
                latitude: propertyData?.coordinates?.latitude ?? null,
                longitude: propertyData?.coordinates?.longitude ?? null,
                officialLandAreaSqm:
                    Number(form.get("officialLandAreaSqm")) || null,
                constructionYear:
                    Number(form.get("constructionYear")) || null,
                livingAreaSqm: Number(form.get("livingAreaSqm")) || null,
                roomCount: Number(form.get("roomCount")) || null,
                bedroomCount: Number(form.get("bedroomCount")) || null,
            };
            return parseResponse(
                await fetch("/api/listings", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(input),
                }),
            );
        },
        onSuccess(data: { id: string }) {
            router.push(`/dashboard/listings/${data.id}`);
            router.refresh();
        },
    });

    function handleLookup(event: FormEvent) {
        event.preventDefault();
        lookup.mutate();
    }

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-8">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                    Nieuwe advertentie
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
                    Voeg je woning toe
                </h1>
                <p className="mt-3 text-muted">
                    We halen eerst betrouwbare adresgegevens op. Alles blijft
                    een concept totdat jij publiceert.
                </p>
            </div>
            <div className="mb-8 flex items-center gap-3">
                {["Adres", "Basisgegevens"].map((label, index) => {
                    const number = index + 1;
                    return (
                        <div
                            key={label}
                            className="flex flex-1 items-center gap-3"
                        >
                            <span
                                className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${step >= number ? "bg-brand text-white" : "border border-line bg-white text-muted"}`}
                            >
                                {step > number ? <Check size={16} /> : number}
                            </span>
                            <span className="hidden text-sm font-semibold sm:block">
                                {label}
                            </span>
                            {index === 0 ? (
                                <span className="h-px flex-1 bg-line" />
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {step === 1 ? (
                <form
                    onSubmit={handleLookup}
                    className="rounded-4xl border border-line bg-white p-6 shadow-sm sm:p-9"
                >
                    <span className="grid size-12 place-items-center rounded-2xl bg-accent text-brand-dark">
                        <MapPin size={22} />
                    </span>
                    <h2 className="mt-6 text-2xl font-semibold">
                        Waar staat de woning?
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted">
                        PDOK controleert het adres en koppelt beschikbare BAG-,
                        Kadaster- en energielabelgegevens.
                    </p>
                    <div className="mt-7 grid gap-4 sm:grid-cols-[1fr_140px_120px]">
                        <Field label="Postcode">
                            <input
                                required
                                value={address.postcode}
                                onChange={(event) =>
                                    setAddress({
                                        ...address,
                                        postcode:
                                            event.target.value.toUpperCase(),
                                    })
                                }
                                placeholder="1234 AB"
                                className="input"
                            />
                        </Field>
                        <Field label="Huisnummer">
                            <input
                                required
                                type="number"
                                min="1"
                                value={address.houseNumber}
                                onChange={(event) =>
                                    setAddress({
                                        ...address,
                                        houseNumber: event.target.value,
                                    })
                                }
                                className="input"
                            />
                        </Field>
                        <Field label="Toevoeging">
                            <input
                                value={address.addition}
                                onChange={(event) =>
                                    setAddress({
                                        ...address,
                                        addition: event.target.value,
                                    })
                                }
                                className="input"
                            />
                        </Field>
                    </div>
                    {lookupError ? (
                        <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                            <p>{lookupError}</p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <input
                                    value={address.street}
                                    onChange={(event) =>
                                        setAddress({
                                            ...address,
                                            street: event.target.value,
                                        })
                                    }
                                    placeholder="Straatnaam"
                                    className="input bg-white"
                                />
                                <input
                                    value={address.city}
                                    onChange={(event) =>
                                        setAddress({
                                            ...address,
                                            city: event.target.value,
                                        })
                                    }
                                    placeholder="Plaats"
                                    className="input bg-white"
                                />
                            </div>
                            <button
                                type="button"
                                disabled={!address.street || !address.city}
                                onClick={() => setStep(2)}
                                className="mt-3 font-semibold text-brand disabled:opacity-40"
                            >
                                Handmatig doorgaan →
                            </button>
                        </div>
                    ) : null}
                    <button
                        disabled={lookup.isPending}
                        className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-white disabled:opacity-60"
                    >
                        {lookup.isPending ? (
                            <LoaderCircle className="animate-spin" size={18} />
                        ) : (
                            <Search size={18} />
                        )}{" "}
                        Adres controleren
                    </button>
                </form>
            ) : (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        createListing.mutate(new FormData(event.currentTarget));
                    }}
                    className="rounded-4xl border border-line bg-white p-6 shadow-sm sm:p-9"
                >
                    <div className="flex items-start gap-4 rounded-2xl bg-background p-4">
                        <span className="grid size-10 place-items-center rounded-xl bg-white text-brand">
                            <Home size={19} />
                        </span>
                        <div>
                            <p className="font-semibold">
                                {propertyData?.address.street ?? address.street}{" "}
                                {address.houseNumber}
                                {address.addition}
                            </p>
                            <p className="text-sm text-muted">
                                {address.postcode}{" "}
                                {propertyData?.address.city ?? address.city}
                            </p>
                        </div>
                    </div>
                    <h2 className="mt-7 text-2xl font-semibold">
                        Vertel ons de basis
                    </h2>
                    <div className="mt-6 grid gap-5 sm:grid-cols-2">
                        <Field label="Ik wil">
                            <select name="purpose" className="input">
                                <option value="SALE">Verkopen</option>
                                <option value="RENT">Verhuren</option>
                            </select>
                        </Field>
                        <Field label="Woningtype">
                            <select
                                name="propertyType"
                                defaultValue={
                                    propertyData?.suggestedPropertyType ??
                                    "HOUSE"
                                }
                                className="input"
                            >
                                <option value="HOUSE">Woonhuis</option>
                                <option value="APARTMENT">Appartement</option>
                                <option value="PARKING">Parkeerplaats</option>
                                <option value="LAND">Grond</option>
                                <option value="COMMERCIAL">Commercieel</option>
                                <option value="OTHER">Overig</option>
                            </select>
                        </Field>
                        <Field label="Woonoppervlak (m²)">
                            <input
                                name="livingAreaSqm"
                                type="number"
                                min="1"
                                step="0.1"
                                required
                                defaultValue={
                                    propertyData?.livingAreaSqm ?? ""
                                }
                                className="input"
                            />
                        </Field>
                        <Field label="Perceeloppervlak (m²)">
                            <input
                                name="officialLandAreaSqm"
                                type="number"
                                min="0"
                                step="0.1"
                                defaultValue={
                                    propertyData?.officialLandAreaSqm ?? ""
                                }
                                className="input"
                            />
                        </Field>
                        <Field label="Aantal kamers">
                            <input
                                name="roomCount"
                                type="number"
                                min="1"
                                required
                                defaultValue={propertyData?.roomCount ?? ""}
                                className="input"
                            />
                        </Field>
                        <Field label="Slaapkamers">
                            <input
                                name="bedroomCount"
                                type="number"
                                min="0"
                                defaultValue={propertyData?.bedroomCount ?? ""}
                                className="input"
                            />
                        </Field>
                        <Field label="Bouwjaar">
                            <input
                                name="constructionYear"
                                type="number"
                                min="1000"
                                max="2200"
                                defaultValue={
                                    propertyData?.constructionYear ?? ""
                                }
                                className="input"
                            />
                        </Field>
                    </div>
                    {createListing.error ? (
                        <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                            {createListing.error.message}
                        </p>
                    ) : null}
                    <div className="mt-8 flex justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="inline-flex h-12 items-center gap-2 rounded-full border border-line px-5 font-semibold"
                        >
                            <ArrowLeft size={17} /> Terug
                        </button>
                        <button
                            disabled={createListing.isPending}
                            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-white disabled:opacity-60"
                        >
                            {createListing.isPending ? (
                                <LoaderCircle
                                    className="animate-spin"
                                    size={18}
                                />
                            ) : null}{" "}
                            Concept maken <ArrowRight size={17} />
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block text-sm font-semibold">
            {label}
            <span className="mt-2 block">{children}</span>
        </label>
    );
}
