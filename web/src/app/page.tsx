import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
    ArrowRight,
    BadgeCheck,
    Bot,
    Building2,
    Check,
    FileCheck2,
    Fingerprint,
    Languages,
    LineChart,
    LockKeyhole,
    MapPinned,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { AuthActions } from "@/components/auth/auth-actions";

const copy = {
    nl: {
        nav: ["Zo werkt het", "Mogelijkheden", "Pakketten"],
        login: "Inloggen",
        eyebrow: "De woningmarkt, maar dan van jou",
        title: "Verkoop of verhuur je woning. Helemaal zelf.",
        intro: "Van slimme vraagprijs tot publicatie en biedingen: één rustig platform met betrouwbare overheidsdata en hulp wanneer jij die nodig hebt.",
        primary: "Start met je woning",
        secondary: "Bekijk hoe het werkt",
        trust: [
            "Eerst e-mail geverifieerd",
            "iDIN pas bij publiceren",
            "Nederlands & English",
        ],
        processTitle: "Veilig waar het moet. Vrij waar het kan.",
        processIntro:
            "Geen onnodige drempels tijdens het maken. Wel een harde identiteitscontrole zodra jouw advertentie naar buiten gaat.",
        steps: [
            [
                "01",
                "Bevestig je e-mail",
                "Na verificatie krijg je toegang tot concepten, uploads, de AI-schrijfhulp en waardeschatting.",
            ],
            [
                "02",
                "Bouw je advertentie",
                "Vul woninggegevens aan, importeer officiële data en voeg foto's en een interactieve of statische plattegrond toe.",
            ],
            [
                "03",
                "Verifieer met iDIN",
                "Pas bij Live zetten of extern publiceren controleren we je identiteit veilig via je bank.",
            ],
            [
                "04",
                "Publiceer & beheer",
                "Kies je pakket, publiceer en houd alle biedingen chronologisch en controleerbaar bij.",
            ],
        ],
        featuresTitle: "Alles voor een sterke woningpresentatie",
        featuresIntro:
            "Professionele gereedschappen, ontworpen voor gewone woningeigenaren.",
        features: [
            [
                "Slimme woningdata",
                "Adresgegevens via PDOK/Kadaster en het laatst geregistreerde energielabel uit EP-Online.",
                "map",
            ],
            [
                "Hybride waardeschatting",
                "Beeldanalyse en een deterministisch prijsmodel, met transparante fallback en bandbreedte.",
                "chart",
            ],
            [
                "AI-schrijfassistent",
                "Een feitelijke, aantrekkelijke omschrijving in het Nederlands of Engels — altijd door jou te controleren.",
                "bot",
            ],
            [
                "Flexibele plattegronden",
                "Koppel Floorplanner voor interactieve plannen of upload PNG, JPEG en PDF.",
                "building",
            ],
            [
                "Transparant biedlogboek",
                "Bedrag, tijdstip en ontbindende voorwaarden veilig in een onveranderbare tijdlijn.",
                "file",
            ],
            [
                "Publiceren zonder makelaar",
                "Valideer, kies Bronze, Silver of Gold en publiceer via onze kanaaladapters.",
                "sparkles",
            ],
        ],
        ctaTitle: "Jouw woning. Jouw proces. Jouw resultaat.",
        ctaText:
            "Maak gratis een account en ontdek eerst wat je woning kan opleveren.",
        cta: "Gratis beginnen",
    },
    en: {
        nav: ["How it works", "Features", "Packages"],
        login: "Sign in",
        eyebrow: "The housing market, on your terms",
        title: "Sell or rent your home. By yourself.",
        intro: "From smart pricing to publishing and offers: one calm platform with trusted public data and help exactly when you need it.",
        primary: "Add your property",
        secondary: "See how it works",
        trust: [
            "Email verified first",
            "iDIN only at publishing",
            "Nederlands & English",
        ],
        processTitle: "Secure where needed. Open where possible.",
        processIntro:
            "No needless barriers while drafting. A strict identity check only when your listing goes public.",
        steps: [
            [
                "01",
                "Confirm your email",
                "Verification unlocks drafts, uploads, the AI writing assistant and price estimator.",
            ],
            [
                "02",
                "Build your listing",
                "Add property details, import official data, photos, and an interactive or static floor plan.",
            ],
            [
                "03",
                "Verify with iDIN",
                "Only when going Live or publishing externally do we verify your identity through your bank.",
            ],
            [
                "04",
                "Publish & manage",
                "Choose a package, publish, and keep every offer in a chronological, verifiable log.",
            ],
        ],
        featuresTitle: "Everything for a strong presentation",
        featuresIntro:
            "Professional tools, designed for everyday property owners.",
        features: [
            [
                "Trusted property data",
                "Address and parcel details through PDOK/Kadaster plus the latest EP-Online energy label.",
                "map",
            ],
            [
                "Hybrid price estimate",
                "Image analysis and deterministic pricing with transparent fallbacks and a value range.",
                "chart",
            ],
            [
                "AI writing assistant",
                "A factual, compelling description in Dutch or English — always under your control.",
                "bot",
            ],
            [
                "Flexible floor plans",
                "Connect Floorplanner for interactive plans or upload PNG, JPEG and PDF files.",
                "building",
            ],
            [
                "Transparent bid log",
                "Amount, timestamp and resolutive conditions secured in an immutable timeline.",
                "file",
            ],
            [
                "Publish without an agent",
                "Validate, choose Bronze, Silver or Gold, and publish through channel adapters.",
                "sparkles",
            ],
        ],
        ctaTitle: "Your home. Your process. Your result.",
        ctaText:
            "Create a free account and start by discovering your property's potential.",
        cta: "Get started free",
    },
} as const;

const featureIcons = {
    map: MapPinned,
    chart: LineChart,
    bot: Bot,
    building: Building2,
    file: FileCheck2,
    sparkles: Sparkles,
};

function ProgressItem({
    icon: Icon,
    label,
    done = false,
}: {
    icon: LucideIcon;
    label: string;
    done?: boolean;
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
            <span
                className={`grid size-9 place-items-center rounded-xl ${done ? "bg-brand/10 text-brand" : "bg-accent/50 text-brand-dark"}`}
            >
                <Icon size={18} />
            </span>
            <span className="flex-1 text-sm font-medium">{label}</span>
            {done ? (
                <Check size={17} className="text-brand" />
            ) : (
                <ArrowRight size={17} className="text-brand" />
            )}
        </div>
    );
}

export default async function Home({
    searchParams,
}: {
    searchParams: Promise<{ lang?: string }>;
}) {
    const language = (await searchParams).lang === "en" ? "en" : "nl";
    const t = copy[language];

    return (
        <div className="min-h-screen overflow-hidden">
            <header className="relative z-20 border-b border-brand/10 bg-background/90 backdrop-blur">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
                    <Link
                        href={`/?lang=${language}`}
                        className="flex items-center gap-2.5 font-semibold tracking-tight"
                    >
                        <span className="grid size-9 place-items-center rounded-xl bg-brand text-white shadow-sm">
                            <Building2 size={19} />
                        </span>
                        <span className="text-xl">
                            Zelf<span className="text-brand">Wonen</span>
                        </span>
                    </Link>
                    <nav className="hidden items-center gap-8 text-sm font-medium text-muted md:flex">
                        <a
                            href="#werkwijze"
                            className="transition hover:text-brand"
                        >
                            {t.nav[0]}
                        </a>
                        <a
                            href="#mogelijkheden"
                            className="transition hover:text-brand"
                        >
                            {t.nav[1]}
                        </a>
                        <a
                            href="#pakketten"
                            className="transition hover:text-brand"
                        >
                            {t.nav[2]}
                        </a>
                    </nav>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Link
                            href={`/?lang=${language === "nl" ? "en" : "nl"}`}
                            className="flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted transition hover:bg-white hover:text-brand"
                            aria-label="Change language"
                        >
                            <Languages size={17} />{" "}
                            {language === "nl" ? "EN" : "NL"}
                        </Link>
                        <AuthActions language={language} />
                    </div>
                </div>
            </header>

            <main>
                <section className="hero-glow relative border-b border-brand/10 px-5 py-20 sm:py-28 lg:px-8 lg:py-36">
                    <div className="dot-grid absolute inset-y-0 right-0 -z-10 w-1/2 opacity-60 mask-[linear-gradient(to_left,black,transparent)]" />
                    <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.1fr_.9fr]">
                        <div>
                            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-brand/15 bg-white/80 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand shadow-sm">
                                <BadgeCheck size={15} /> {t.eyebrow}
                            </div>
                            <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                                {t.title}
                            </h1>
                            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
                                {t.intro}
                            </p>
                            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                                <a
                                    href="#start"
                                    className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand px-7 font-semibold text-white shadow-[0_12px_30px_rgba(7,107,82,.22)] transition hover:-translate-y-0.5 hover:bg-brand-dark"
                                >
                                    {t.primary} <ArrowRight size={18} />
                                </a>
                                <a
                                    href="#werkwijze"
                                    className="inline-flex h-14 items-center justify-center rounded-full border border-line bg-white px-7 font-semibold transition hover:border-brand/30"
                                >
                                    {t.secondary}
                                </a>
                            </div>
                            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted">
                                {t.trust.map((item) => (
                                    <span
                                        key={item}
                                        className="flex items-center gap-2"
                                    >
                                        <Check
                                            className="text-brand"
                                            size={16}
                                        />
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="relative mx-auto w-full max-w-lg lg:ml-auto">
                            <div className="absolute -inset-4 -z-10 rotate-3 rounded-[2.5rem] bg-accent/55" />
                            <div className="rounded-4xl border border-brand/10 bg-white p-5 shadow-[0_30px_80px_rgba(16,40,32,.15)] sm:p-7">
                                <div className="flex items-center justify-between border-b border-line pb-5">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
                                            Conceptadvertentie
                                        </p>
                                        <h2 className="mt-1 text-xl font-semibold">
                                            Lindengracht 142, Amsterdam
                                        </h2>
                                    </div>
                                    <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                                        Concept
                                    </span>
                                </div>
                                <div className="my-5 grid grid-cols-3 gap-3">
                                    {[
                                        ["Woonoppervlak", "91 m²"],
                                        ["Kamers", "4"],
                                        ["Energielabel", "A+"],
                                    ].map(([label, value]) => (
                                        <div
                                            key={label}
                                            className="rounded-2xl bg-background p-3.5"
                                        >
                                            <p className="text-[11px] text-muted">
                                                {label}
                                            </p>
                                            <p className="mt-1 font-semibold">
                                                {value}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                <div className="space-y-3">
                                    <ProgressItem
                                        icon={ShieldCheck}
                                        label="E-mail geverifieerd"
                                        done
                                    />
                                    <ProgressItem
                                        icon={MapPinned}
                                        label="Woningdata opgehaald"
                                        done
                                    />
                                    <ProgressItem
                                        icon={Sparkles}
                                        label="Beschrijving met AI verbeterd"
                                        done
                                    />
                                    <ProgressItem
                                        icon={Fingerprint}
                                        label="iDIN bij publiceren"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="werkwijze" className="px-5 py-24 lg:px-8 lg:py-32">
                    <div className="mx-auto max-w-7xl">
                        <div className="max-w-2xl">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
                                Vertrouwen ingebouwd
                            </p>
                            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
                                {t.processTitle}
                            </h2>
                            <p className="mt-5 text-lg leading-8 text-muted">
                                {t.processIntro}
                            </p>
                        </div>
                        <div className="mt-14 grid gap-px overflow-hidden rounded-4xl border border-line bg-line md:grid-cols-2 lg:grid-cols-4">
                            {t.steps.map(([number, title, description]) => (
                                <article
                                    key={number}
                                    className="min-h-64 bg-white p-7 lg:p-8"
                                >
                                    <span className="font-mono text-sm font-semibold text-brand">
                                        {number}
                                    </span>
                                    <h3 className="mt-12 text-xl font-semibold">
                                        {title}
                                    </h3>
                                    <p className="mt-3 text-sm leading-6 text-muted">
                                        {description}
                                    </p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section
                    id="mogelijkheden"
                    className="bg-brand-dark px-5 py-24 text-white lg:px-8 lg:py-32"
                >
                    <div className="mx-auto max-w-7xl">
                        <div className="max-w-2xl">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                                Eén compleet platform
                            </p>
                            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
                                {t.featuresTitle}
                            </h2>
                            <p className="mt-5 text-lg text-white/65">
                                {t.featuresIntro}
                            </p>
                        </div>
                        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {t.features.map(([title, description, icon]) => {
                                const Icon = featureIcons[icon];
                                return (
                                    <article
                                        key={title}
                                        className="group rounded-3xl border border-white/10 bg-white/5 p-7 transition hover:-translate-y-1 hover:bg-white/10"
                                    >
                                        <span className="grid size-11 place-items-center rounded-2xl bg-accent text-brand-dark">
                                            <Icon size={21} />
                                        </span>
                                        <h3 className="mt-7 text-xl font-semibold">
                                            {title}
                                        </h3>
                                        <p className="mt-3 text-sm leading-6 text-white/62">
                                            {description}
                                        </p>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section id="pakketten" className="px-5 py-20 lg:px-8 lg:py-28">
                    <div
                        id="start"
                        className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-accent px-7 py-14 sm:px-14 sm:py-16 lg:px-20"
                    >
                        <div className="dot-grid absolute inset-y-0 right-0 w-1/2 opacity-35" />
                        <div className="relative max-w-3xl">
                            <LockKeyhole
                                className="mb-7 text-brand"
                                size={30}
                            />
                            <h2 className="text-4xl font-semibold tracking-[-0.04em] text-brand-dark sm:text-5xl">
                                {t.ctaTitle}
                            </h2>
                            <p className="mt-5 text-lg text-brand-dark/70">
                                {t.ctaText}
                            </p>
                            <AuthActions language={language} placement="cta" />
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-line px-5 py-8 text-sm text-muted lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row">
                    <p>
                        © 2026 ZelfWonen. Gebouwd voor de Nederlandse
                        woningmarkt.
                    </p>
                    <div className="flex gap-6">
                        <a href="#">Privacy</a>
                        <a href="#">Voorwaarden</a>
                        <a href="#">Contact</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
