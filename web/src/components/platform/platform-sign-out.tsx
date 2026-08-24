"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function PlatformSignOut() {
    const router = useRouter();
    return (
        <button
            type="button"
            onClick={async () => {
                await signOut();
                router.push("/");
                router.refresh();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold transition hover:border-brand/30 hover:text-brand"
        >
            <LogOut size={16} /> Uitloggen
        </button>
    );
}
