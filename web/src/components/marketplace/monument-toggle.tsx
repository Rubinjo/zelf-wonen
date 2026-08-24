"use client";

import { useState } from "react";

export type MonumentFilter = "all" | "only" | "exclude";

const options = [
    { value: "", label: "Alle panden", state: "all" },
    { value: "true", label: "Alleen monumenten", state: "only" },
    { value: "false", label: "Geen monumenten", state: "exclude" },
] as const;

export function MonumentToggle({ value }: { value: MonumentFilter }) {
    const [selected, setSelected] = useState<MonumentFilter>(value);

    return (
        <div
            role="radiogroup"
            aria-label="Monumentstatus"
            className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-background p-1"
        >
            {options.map((option) => (
                <label
                    key={option.value}
                    className="min-w-0 cursor-pointer"
                    title={option.label}
                >
                    <input
                        type="radio"
                        name="isMonument"
                        value={option.value}
                        checked={selected === option.state}
                        onChange={() => setSelected(option.state)}
                        className="peer sr-only"
                    />
                    <span className="flex min-h-8 items-center justify-center rounded-md px-1 py-1 text-center text-[11px] font-semibold leading-tight text-muted transition peer-checked:bg-surface peer-checked:text-brand peer-checked:shadow-sm sm:text-xs">
                        {option.label}
                    </span>
                </label>
            ))}
        </div>
    );
}
