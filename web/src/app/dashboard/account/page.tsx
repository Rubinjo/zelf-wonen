import { TwoFactorSettings } from "@/components/auth/two-factor-settings";

export default function AccountPage() {
    return (
        <div className="mx-auto max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                Accountbeveiliging
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
                Beveilig je account
            </h1>
            <p className="mb-8 mt-3 text-muted">
                E-mailverificatie beschermt de toegang; tweestapsverificatie
                voegt een extra beveiligingslaag toe.
            </p>
            <TwoFactorSettings />
        </div>
    );
}
