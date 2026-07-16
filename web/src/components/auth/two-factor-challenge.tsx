"use client";

import { useState, type FormEvent } from "react";
import { Building2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function TwoFactorChallenge() {
    const router = useRouter();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        const code = String(
            new FormData(event.currentTarget).get("code") ?? "",
        ).trim();
        const result = code.includes("-")
            ? await authClient.twoFactor.verifyBackupCode({
                  code,
                  trustDevice: true,
              })
            : await authClient.twoFactor.verifyTotp({
                  code,
                  trustDevice: true,
              });
        setBusy(false);
        if (result.error)
            return setError(result.error.message ?? "De code is ongeldig");
        router.replace("/dashboard");
        router.refresh();
    }

    return (
        <main className="grid min-h-screen place-items-center bg-brand-dark p-5">
            <div className="w-full max-w-md rounded-4xl bg-white p-7 shadow-2xl sm:p-9">
                <div className="flex items-center gap-2.5 font-semibold">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand text-white">
                        <Building2 size={20} />
                    </span>
                    <span className="text-xl">
                        Zelf<span className="text-brand">Wonen</span>
                    </span>
                </div>
                <span className="mt-9 grid size-12 place-items-center rounded-2xl bg-accent text-brand-dark">
                    <ShieldCheck size={23} />
                </span>
                <h1 className="mt-5 text-3xl font-semibold tracking-tight">
                    Tweestapsverificatie
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted">
                    Voer de code uit je authenticator-app in. Je kunt ook één
                    van je herstelcodes gebruiken.
                </p>
                <form onSubmit={submit} className="mt-7">
                    <label className="text-sm font-semibold">
                        Verificatiecode
                        <input
                            autoFocus
                            name="code"
                            autoComplete="one-time-code"
                            required
                            className="input mt-2 text-center text-lg tracking-[0.24em]"
                        />
                    </label>
                    {error ? (
                        <p
                            role="alert"
                            className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700"
                        >
                            {error}
                        </p>
                    ) : null}
                    <button
                        disabled={busy}
                        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white disabled:opacity-60"
                    >
                        {busy ? (
                            <LoaderCircle className="animate-spin" size={17} />
                        ) : null}{" "}
                        Verifiëren
                    </button>
                </form>
            </div>
        </main>
    );
}
