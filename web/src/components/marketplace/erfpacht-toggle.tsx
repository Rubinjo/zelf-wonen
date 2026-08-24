"use client";

import { useState } from "react";

export type ErfpachtFilter = "all" | "leasehold" | "freehold";

const options = [
    { value: "", label: "Alle woningen", state: "all" },
    { value: "leasehold", label: "Alleen erfpacht", state: "leasehold" },
    { value: "freehold", label: "Volle eigendom", state: "freehold" },
] as const;

export function ErfpachtToggle({ value }: { value: ErfpachtFilter }) {
    const [selected, setSelected] = useState<ErfpachtFilter>(value);

    return (
        <div
            role="radiogroup"
            aria-label="Erfpacht"
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
                        name="erfpacht"
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
