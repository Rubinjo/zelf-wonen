import { Ruler } from "lucide-react";

export function DetailGroup({
    icon: Icon,
    title,
    items,
}: {
    icon: typeof Ruler;
    title: string;
    items: (readonly [string, string | number | null | undefined])[];
}) {
    const availableItems = items.filter(([, value]) => value !== null);
    if (availableItems.length === 0) return null;

    return (
        <div className="grid gap-5 py-6 sm:grid-cols-[180px_1fr]">
            <h3 className="flex items-center gap-2 font-semibold">
                <Icon size={18} className="text-brand" /> {title}
            </h3>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {availableItems.map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-xs font-semibold text-muted">
                            {label}
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                            {value ?? "—"}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

export function DetailTags({
    icon: Icon,
    title,
    values,
    extra,
}: {
    icon: typeof Ruler;
    title: string;
    values: string[];
    extra?: string | null;
}) {
    if (values.length === 0 && !extra) return null;

    return (
        <div className="grid gap-5 py-6 sm:grid-cols-[180px_1fr]">
            <h3 className="flex items-center gap-2 font-semibold">
                <Icon size={18} className="text-brand" /> {title}
            </h3>
            <div>
                <div className="flex flex-wrap gap-2">
                    {values.map((value) => (
                        <span
                            key={value}
                            className="rounded-md bg-background px-3 py-2 text-sm"
                        >
                            {value}
                        </span>
                    ))}
                </div>
                {extra ? (
                    <p className="mt-3 text-sm font-medium">{extra}</p>
                ) : null}
            </div>
        </div>
    );
}
