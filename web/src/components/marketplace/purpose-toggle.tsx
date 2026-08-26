"use client";

import { useState } from "react";

/**
 * Keuze tussen kopen en huren als filter in de filterbalk van /zoeken.
 * Volgt hetzelfde radiopatroon als MonumentToggle zodat de keuze pas
 * wordt toegepast via de knop "Toepassen" van het filterpaneel.
 */
export function PurposeToggle({ value }: { value: "SALE" | "RENT" }) {
    const [selected, setSelected] = useState<"SALE" | "RENT">(value);

    return (
        <div
            role="radiogroup"
            aria-label="Koop of huur"
            className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-background p-1"
        >
            {(
                [
                    ["SALE", "Kopen"],
                    ["RENT", "Huren"],
                ] as const
            ).map(([optionValue, label]) => (
                <label key={optionValue} className="cursor-pointer">
                    <input
                        type="radio"
                        name="purpose"
                        value={optionValue}
                        checked={selected === optionValue}
                        onChange={() => setSelected(optionValue)}
                        className="peer sr-only"
                    />
                    <span className="flex min-h-8 items-center justify-center rounded-md px-2 text-xs font-semibold text-muted transition peer-checked:bg-surface peer-checked:text-brand peer-checked:shadow-sm">
                        {label}
                    </span>
                </label>
            ))}
        </div>
    );
}
