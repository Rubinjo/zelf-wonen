"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import QRCode from "react-qr-code";
import { authClient, useSession } from "@/lib/auth-client";

export function TwoFactorSettings() {
    const { data: session, refetch } = useSession();
    const [totpUri, setTotpUri] = useState("");
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const enabled = Boolean(session?.user.twoFactorEnabled);

    async function enable(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        const password = String(
            new FormData(event.currentTarget).get("password") ?? "",
        );
        const result = await authClient.twoFactor.enable({ password });
        setBusy(false);
        if (result.error)
            return setError(result.error.message ?? "2FA activeren is mislukt");
        setTotpUri(result.data.totpURI);
        setBackupCodes(result.data.backupCodes);
    }

    async function verify(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        const code = String(
            new FormData(event.currentTarget).get("code") ?? "",
        );
        const result = await authClient.twoFactor.verifyTotp({
            code,
            trustDevice: true,
        });
        setBusy(false);
        if (result.error)
            return setError(result.error.message ?? "De code is ongeldig");
        setTotpUri("");
        await refetch();
    }

    async function disable(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        const password = String(
            new FormData(event.currentTarget).get("password") ?? "",
        );
        const result = await authClient.twoFactor.disable({ password });
        setBusy(false);
        if (result.error)
            return setError(
                result.error.message ?? "2FA uitschakelen is mislukt",
            );
        setBackupCodes([]);
        await refetch();
    }

    return (
        <div className="rounded-4xl border border-line bg-white p-6 shadow-sm sm:p-9">
            <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-brand-dark">
                    <ShieldCheck size={23} />
                </span>
                <div>
                    <h2 className="text-2xl font-semibold">
                        Authenticator-app (TOTP)
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted">
                        Beveilig je account met een tweede factor. Een vertrouwd
                        apparaat kan 30 dagen worden onthouden.
                    </p>
                </div>
            </div>

            <div
                className={`mt-7 rounded-2xl p-4 text-sm font-semibold ${enabled ? "bg-brand/8 text-brand" : "bg-amber-50 text-amber-900"}`}
            >
                {enabled
                    ? "Tweestapsverificatie is actief"
                    : "Tweestapsverificatie is nog niet actief"}
            </div>

            {error ? (
                <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </p>
            ) : null}

            {!enabled && !totpUri ? (
                <form onSubmit={enable} className="mt-7 max-w-md">
                    <label className="text-sm font-semibold">
                        Bevestig je huidige wachtwoord
                        <input
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            className="input mt-2"
                        />
                    </label>
                    <button
                        disabled={busy}
                        className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-white disabled:opacity-60"
                    >
                        {busy ? (
                            <LoaderCircle className="animate-spin" size={17} />
                        ) : (
                            <KeyRound size={17} />
                        )}{" "}
                        2FA instellen
                    </button>
                </form>
            ) : null}

            {totpUri ? (
                <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
                    <div className="rounded-3xl border border-line bg-white p-5">
                        <QRCode value={totpUri} className="h-auto w-full" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold">
                            Scan en bevestig
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted">
                            Scan de QR-code met je authenticator-app en voer de
                            zescijferige code in.
                        </p>
                        <form onSubmit={verify} className="mt-5">
                            <input
                                name="code"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                required
                                className="input max-w-56 text-center text-xl tracking-[0.35em]"
                            />
                            <button
                                disabled={busy}
                                className="mt-3 block h-12 rounded-full bg-brand px-6 font-semibold text-white disabled:opacity-60"
                            >
                                Code verifiëren
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}

            {backupCodes.length > 0 ? (
                <div className="mt-8 rounded-3xl bg-background p-6">
                    <h3 className="font-semibold">
                        Herstelcodes — bewaar deze nu veilig
                    </h3>
                    <p className="mt-2 text-sm text-muted">
                        Elke code kan één keer worden gebruikt. Deel ze met
                        niemand.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
                        {backupCodes.map((code) => (
                            <span
                                key={code}
                                className="rounded-lg bg-white px-3 py-2"
                            >
                                {code}
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}

            {enabled ? (
                <form
                    onSubmit={disable}
                    className="mt-8 border-t border-line pt-7"
                >
                    <h3 className="font-semibold">2FA uitschakelen</h3>
                    <div className="mt-3 flex max-w-lg flex-col gap-3 sm:flex-row">
                        <input
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            placeholder="Huidig wachtwoord"
                            className="input"
                        />
                        <button
                            disabled={busy}
                            className="shrink-0 rounded-full border border-red-200 px-5 py-3 text-sm font-semibold text-red-700 disabled:opacity-60"
                        >
                            Uitschakelen
                        </button>
                    </div>
                </form>
            ) : null}
        </div>
    );
}
