"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PropertyData } from "@/lib/schemas/property";
import { storeNewListingDraft } from "@/features/listings/create-listing-draft";

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
    const [address, setAddress] = useState<DraftAddress>({
        postcode: "",
        houseNumber: "",
        addition: "",
        street: "",
        city: "",
    });
    const [lookupError, setLookupError] = useState("");

    const lookup = useMutation({
        mutationFn: async () => {
            const query = new URLSearchParams({
                postcode: address.postcode,
                houseNumber: address.houseNumber,
            });
            if (address.addition) query.set("addition", address.addition);
            const property = (await parseResponse(
                await fetch(`/api/property-data?${query}`),
            )) as PropertyData;
            setAddress((current) => ({
                ...current,
                street: property.address.street,
                city: property.address.city,
            }));
            return property;
        },
        onSuccess(property) {
            setLookupError("");
            storeNewListingDraft({
                address: {
                    postcode: address.postcode,
                    houseNumber: address.houseNumber,
                    addition: address.addition,
                    street: property.address.street,
                    city: property.address.city,
                },
                property,
            });
            router.push("/dashboard/listings/new?create=1");
        },
        onError(error) {
            setLookupError(
                error instanceof Error ? error.message : "Adres niet gevonden",
            );
        },
    });

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setLookupError("");
        lookup.mutate();
    }

    function handleManualContinue() {
        if (!address.street || !address.city) return;
        setLookupError("");
        storeNewListingDraft({
            address: {
                postcode: address.postcode,
                houseNumber: address.houseNumber,
                addition: address.addition,
                street: address.street,
                city: address.city,
            },
            property: null,
        });
        router.push("/dashboard/listings/new?create=1");
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
                    We controleren het adres en openen daarna je concept. Je
                    slaat het concept zelf op; alles blijft een concept totdat
                    je publiceert.
                </p>
            </div>
            <form
                onSubmit={handleSubmit}
                className="rounded-4xl border border-line bg-surface p-6 shadow-sm sm:p-9"
            >
                <span className="grid size-12 place-items-center rounded-2xl bg-accent text-brand-dark">
                    <MapPin size={22} />
                </span>
                <h2 className="mt-6 text-2xl font-semibold">
                    Waar staat de woning?
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                    PDOK controleert het adres en koppelt beschikbare BAG-,
                    Kadaster- en energielabelgegevens. Daarna ga je meteen
                    verder in je concept.
                </p>
                <div className="mt-7 grid gap-4 sm:grid-cols-[1fr_140px_120px]">
                    <Field label="Postcode">
                        <input
                            required
                            value={address.postcode}
                            onChange={(event) =>
                                setAddress({
                                    ...address,
                                    postcode: event.target.value.toUpperCase(),
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
                    <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
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
                                className="input"
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
                                className="input"
                            />
                        </div>
                        <button
                            type="button"
                            disabled={!address.street || !address.city}
                            onClick={handleManualContinue}
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
                    {lookup.isPending
                        ? "Adres controleren..."
                        : "Adres controleren"}
                </button>
            </form>
        </div>
    );
}

function Field({
    label,
    required,
    children,
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <label className="block text-sm font-semibold">
            {label}
            {required ? (
                <span className="text-red-600" title="Verplicht veld">
                    {" "}
                    *
                </span>
            ) : null}
            <span className="mt-2 block">{children}</span>
        </label>
    );
}
