import { getAdminMetrics } from "@/features/admin/metrics";
import { getLanguage } from "@/lib/language";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin dashboard", robots: { index: false, follow: false } };

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
    return <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        {detail && <p className="mt-2 text-xs text-muted">{detail}</p>}
    </div>;
}

export default async function AdminPage() {
    const data = await getAdminMetrics();
    const en = await getLanguage() === "en";
    const t = (nl: string, english: string) => en ? english : nl;
    const usd = (amount: number) => new Intl.NumberFormat(en ? "en-US" : "nl-NL", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount);
    const usage = data.openRouter;
    const statusLabels: Record<string, string> = {
        DRAFT: t("Concept", "Draft"), READY_FOR_VERIFICATION: t("Te verifiëren", "Awaiting verification"),
        LIVE: t("Gepubliceerd", "Live"), UNDER_OFFER: t("Onder bod", "Under offer"), SOLD: t("Verkocht", "Sold"),
        RENTED: t("Verhuurd", "Rented"), ARCHIVED: t("Gearchiveerd", "Archived"),
        INITIATED: t("Gestart / gereserveerd", "Started / reserved"), PENDING: t("In behandeling", "Pending"),
        VERIFIED: t("Goedgekeurd", "Verified"), FAILED: t("Mislukt", "Failed"), EXPIRED: t("Verlopen", "Expired"), CANCELLED: t("Geannuleerd", "Cancelled"),
    };
    return <div className="space-y-8 pb-24">
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-sm font-semibold text-brand">{t("Alleen eigenaar", "Owner only")}</p>
                <h1 className="mt-2 text-3xl font-semibold">{t("Beheerdersdashboard", "Admin dashboard")}</h1>
                <p className="mt-2 text-sm text-muted">{t("Bijgewerkt", "Updated")}: {data.now.toLocaleString(en ? "en-GB" : "nl-NL", { timeZone: "Europe/Amsterdam" })} (Europe/Amsterdam)</p>
            </div>
            <form action="/dashboard/admin" method="get"><button type="submit" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">{t("Vernieuwen", "Refresh")}</button></form>
        </header>
        <section aria-labelledby="accounts"><h2 id="accounts" className="mb-4 text-xl font-semibold">Accounts</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label={t("Totaal accounts", "Total accounts")} value={data.totalAccounts} />
                <Metric label={t("Actieve accounts", "Active accounts")} value={data.activeAccounts} detail={t("Unieke accounts met een niet-verlopen sessie; geen meting van bezoeken.", "Unique accounts with an unexpired session; not a measure of visits.")} />
                <Metric label={t("Nieuw deze maand", "New this month")} value={data.newAccounts} detail={t("Vanaf het begin van de UTC-maand", "Since the start of the UTC month")} />
                <Metric label={t("E-mail geverifieerd", "Email verified")} value={data.verifiedAccounts} />
            </div>
        </section>
        <section aria-labelledby="ai"><h2 id="ai" className="mb-2 text-xl font-semibold">OpenRouter</h2>
            <p className="mb-4 text-sm text-muted">{t("Werkelijke kosten in USD voor de ingestelde API-sleutel. Gedeelde sleutels omvatten ook ander gebruik. Perioden volgen UTC; externe BYOK-providerkosten zijn niet inbegrepen.", "Reported USD costs for the configured API key. Shared keys include other usage. Periods follow UTC; external BYOK provider costs are excluded.")}</p>
            {usage.status === "available" ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label={t("Totale kosten", "Total spend")} value={usd(usage.usage)} />
                <Metric label={t("Vandaag", "Today")} value={usd(usage.usage_daily)} />
                <Metric label={t("Deze maand", "This month")} value={usd(usage.usage_monthly)} />
                <Metric label={t("Resterend sleutellimiet", "Remaining key limit")} value={usage.limit_remaining === null ? t("Geen limiet", "No limit") : usd(usage.limit_remaining)} detail={t("Dit is niet het accountsaldo.", "This is not the account credit balance.")} />
            </div> : <p role="status" className="rounded-2xl border border-line bg-surface p-5">{usage.status === "unconfigured" ? t("OpenRouter is niet ingesteld.", "OpenRouter is not configured.") : t("OpenRouter-kosten zijn tijdelijk niet beschikbaar. Probeer opnieuw te vernieuwen.", "OpenRouter costs are temporarily unavailable. Try refreshing again.")}</p>}
        </section>
        <section aria-labelledby="listings"><h2 id="listings" className="mb-4 text-xl font-semibold">{t("Woningen en transacties", "Listings and transactions")}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
                <Metric label={t("Eigen platformwoningen", "Native platform listings")} value={data.listings.reduce((sum, row) => sum + row._count._all, 0)} />
                <Metric label={t("Actieve externe woningen", "Active aggregated listings")} value={data.aggregatedListings} />
                <Metric label={t("Actieve transacties", "Active transactions")} value={data.transactions} />
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(statusLabels).slice(0, 7).map(([status, label]) => <div key={status} className="flex justify-between border-b border-line py-2"><dt>{label}</dt><dd className="font-semibold">{data.listings.find(row => row.status === status)?._count._all ?? 0}</dd></div>)}</dl>
        </section>
        <section aria-labelledby="didit"><h2 id="didit" className="mb-2 text-xl font-semibold">Didit</h2>
            <p className="mb-4 text-sm text-muted">{t("Lokaal geregistreerde verificatiepogingen, geen facturatiegegevens. Het app-budget telt live, sandbox en openstaande reserveringen uit eerdere maanden mee.", "Locally recorded verification attempts, not billing data. The app budget includes live, sandbox and outstanding reservations from earlier months.")}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label={t("App-budget gebruikt", "App budget used")} value={data.diditBudget + " / " + data.diditLimit} />
                <Metric label={t("App-budget resterend", "App budget remaining")} value={Math.max(0, data.diditLimit - data.diditBudget)} />
                <Metric label={t("Live gestart deze UTC-maand", "Live started this UTC month")} value={data.diditMonth.find(row => row.provider === "DIDIT")?._count._all ?? 0} />
                <Metric label={t("Sandbox gestart deze UTC-maand", "Sandbox started this UTC month")} value={data.diditMonth.find(row => row.provider === "DIDIT_SANDBOX")?._count._all ?? 0} />
            </div>
            <h3 className="mt-5 font-semibold">{t("Alle pogingen per huidige status", "All attempts by current status")}</h3>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(statusLabels).slice(7).map(([status, label]) => <div key={status} className="flex justify-between border-b border-line py-2"><dt>{label}</dt><dd className="font-semibold">{data.diditStatuses.find(row => row.status === status)?._count._all ?? 0}</dd></div>)}</dl>
        </section>
    </div>;
}
