import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
    ArrowRight,
    BadgeCheck,
    Bot,
    Building2,
    Check,
    FileCheck2,
    Handshake,
    Languages,
    LineChart,
    MapPinned,
    Megaphone,
    PiggyBank,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { AuthActions } from "@/components/auth/auth-actions";
import { HomeScene } from "@/components/marketing/home-scene";

const copy = {
    nl: {
        nav: ["Zo werkt het", "Mogelijkheden", "Kosten vergelijken"],
        eyebrow: "Zelf je huis verkopen of verhuren",
        title: "Jouw huis verkopen. Zonder verkoopmakelaar.",
        intro: "Maak zelf een overtuigende woningadvertentie, bepaal een slimme vraagprijs en bereik woningzoekers via ZelfWonen, Funda en Kamernet. Jij houdt de regie én bespaart op makelaarskosten.",
        primary: "Start met je woning",
        secondary: "Bekijk hoe het werkt",
        trust: [
            "Pakketten vanaf €99",
            "Voor verkoop én verhuur",
            "Publiceren op Funda & Kamernet",
        ],
        listing: {
            eyebrow: "Conceptadvertentie",
            status: "Bijna klaar",
            address: "Lindengracht 142, Amsterdam",
            sceneLabel:
                "Driedimensionale isometrische impressie van een lichte woonkamer",
            stats: [
                ["Woonoppervlak", "91 m²"],
                ["Kamers", "4"],
                ["Energielabel", "A+"],
            ],
            progress: [
                "Woningprofiel compleet",
                "Vraagprijs bepaald",
                "Klaar om te publiceren",
            ],
            channels: "Kies je bereik",
        },
        channelsEyebrow: "Eén advertentie, groter bereik",
        channelsTitle: "Zichtbaar waar woningzoekers al zoeken",
        channelsText:
            "Beheer je woning op één plek en kies Funda voor verkoop of verhuur. Voor verhuur kun je ook kiezen voor Kamernet. Beschikbaarheid en kanaalkosten hangen af van je pakket.",
        processEyebrow: "Verkopen zonder makelaar",
        processTitle: "Van eerste idee naar bezichtiging",
        processIntro:
            "Zelf je huis verkopen of verhuren betekent niet dat je alles hoeft uit te zoeken. ZelfWonen geeft je per stap houvast, terwijl jij de keuzes maakt.",
        steps: [
            [
                "01",
                "Vertel over je woning",
                "Start met je adres. Wij helpen je de belangrijkste woninggegevens, kenmerken en documenten compleet te maken.",
            ],
            [
                "02",
                "Maak je advertentie sterk",
                "Voeg foto's en een plattegrond toe en maak een heldere tekst in het Nederlands of Engels.",
            ],
            [
                "03",
                "Kies prijs en bereik",
                "Gebruik de waarde-indicatie als vertrekpunt en kies waar je verkoop- of verhuuradvertentie verschijnt.",
            ],
            [
                "04",
                "Plan en beslis zelf",
                "Begeleid je eigen bezichtigingen, vergelijk biedingen en bepaal zelf met wie je verdergaat.",
            ],
        ],
        featuresEyebrow: "Jij verkoopt, wij helpen",
        featuresTitle: "Alles voor een sterke woningpresentatie",
        featuresIntro:
            "De praktische hulpmiddelen van een verkoopmakelaar, met de vrijheid en lagere kosten van zelf verkopen.",
        features: [
            [
                "Woninggegevens op één plek",
                "Begin sneller met beschikbare adres-, perceel- en energielabelgegevens en vul zelf aan wat jouw woning bijzonder maakt.",
                "map",
            ],
            [
                "Een slimme vraagprijs",
                "Krijg een heldere waarde-indicatie met bandbreedte, zodat je met meer vertrouwen je vraagprijs kiest.",
                "chart",
            ],
            [
                "Tekst die woningzoekers raakt",
                "Maak van jouw input een aantrekkelijke advertentietekst in het Nederlands of Engels, altijd onder jouw controle.",
                "bot",
            ],
            [
                "Foto's en plattegronden",
                "Presenteer iedere ruimte met foto's en een interactieve of vaste plattegrond die op elk scherm goed werkt.",
                "building",
            ],
            [
                "Biedingen rustig vergelijken",
                "Zie bedragen, momenten en voorwaarden overzichtelijk naast elkaar voordat jij een beslissing neemt.",
                "file",
            ],
            [
                "Bereik via Funda en Kamernet",
                "Kies het kanaal dat past bij verkoop of verhuur en beheer de voortgang vanuit één vertrouwde omgeving.",
                "sparkles",
            ],
        ],
        comparisonEyebrow: "Vergelijk met een verkoopmakelaar",
        comparisonTitle: "Meer regie. Veel minder makelaarskosten.",
        comparisonIntro:
            "ZelfWonen is gebouwd voor wie de goedkoopste makelaar zoekt, maar vooral zelf wil bepalen hoe de verkoop of verhuur verloopt. Dit is wat je betaalt én wat je zelf doet.",
        comparisonLabels: ["ZelfWonen", "Verkoopmakelaar"],
        comparisonRows: [
            ["Basiskosten", "€99 – €299", "Courtage en vaak opstartkosten"],
            [
                "Funda of Kamernet",
                "Je kiest de plaatsing. Externe kanaalkosten kunnen apart gelden",
                "Vaak in het pakket verwerkt of apart doorberekend",
            ],
            [
                "Woningpresentatie",
                "Je maakt foto's en controleert de advertentie zelf",
                "De makelaar coördineert dit meestal",
            ],
            [
                "Bezichtigingen",
                "Je plant en begeleidt ze zelf",
                "De makelaar begeleidt ze",
            ],
            [
                "Biedingen en keuze",
                "Jij vergelijkt en beslist met een duidelijk overzicht",
                "De makelaar adviseert en onderhandelt",
            ],
            [
                "Indicatieve totale kosten",
                "Vanaf €99, exclusief gekozen externe plaatsing",
                "Vaak €3.000 – €7.000+, afhankelijk van woning en courtage",
            ],
        ],
        comparisonHighlight:
            "Bespaar op makelaarskosten en houd zelf de regie over de verkoop van je woning.",
        comparisonNote:
            "Indicatieve vergelijking, geen offerte. Makelaarstarieven en kanaalkosten verschillen per aanbieder, regio, woning en pakket. Controleer vóór betaling altijd welke externe plaatsingen zijn inbegrepen.",
        faqEyebrow: "Veelgestelde vragen",
        faqTitle: "Zelf verkopen, helder uitgelegd",
        faqs: [
            [
                "Kan ik mijn huis verkopen zonder makelaar?",
                "Ja. Als eigenaar kun je zelf je huis verkopen. Je regelt dan onder meer de presentatie, bezichtigingen en keuze uit biedingen. Voor de juridische overdracht blijft een notaris nodig.",
            ],
            [
                "Kan mijn woning op Funda of Kamernet komen?",
                "Je kunt vanuit ZelfWonen een passende doorplaatsing kiezen. Funda is beschikbaar voor verkoop en verhuur. Voor verhuur kun je ook kiezen voor Kamernet. De beschikbare kanalen en eventuele plaatsingskosten zie je bij je pakketkeuze.",
            ],
            [
                "Wat moet ik zelf doen bij bezichtigingen?",
                "Je plant de afspraken, ontvangt geïnteresseerden en beantwoordt vragen over de woning. Jij kent het huis het best. Wij helpen je om informatie en biedingen overzichtelijk te houden.",
            ],
        ],
        ctaTitle: "Jouw woning. Jouw proces. Jouw resultaat.",
        ctaText:
            "Maak gratis een account en ontdek hoe eenvoudig zelf verkopen of verhuren kan zijn.",
        footer: "© 2026 ZelfWonen. Voor de Nederlandse woningmarkt.",
        footerLinks: ["Privacy", "Voorwaarden", "Contact"],
    },
    en: {
        nav: ["How it works", "Features", "Compare costs"],
        eyebrow: "Sell or rent out your own home",
        title: "Sell your home. Without an estate agent.",
        intro: "Create a compelling property listing, choose a smart asking price and reach home seekers through ZelfWonen, Funda and Kamernet. You stay in control and save on estate agent fees.",
        primary: "Add your property",
        secondary: "See how it works",
        trust: [
            "Packages from €99",
            "For selling and renting",
            "Publish on Funda & Kamernet",
        ],
        listing: {
            eyebrow: "Draft listing",
            status: "Almost ready",
            address: "142 Lindengracht, Amsterdam",
            sceneLabel:
                "Three-dimensional isometric impression of a bright living room",
            stats: [
                ["Living area", "91 m²"],
                ["Rooms", "4"],
                ["Energy label", "A+"],
            ],
            progress: [
                "Property profile complete",
                "Asking price selected",
                "Ready to publish",
            ],
            channels: "Choose your reach",
        },
        channelsEyebrow: "One listing, wider reach",
        channelsTitle: "Visible where property seekers already search",
        channelsText:
            "Manage your property in one place and choose Funda for a sale or rental. For rentals, you can also choose Kamernet. Availability and channel fees depend on your package.",
        processEyebrow: "Sell without an estate agent",
        processTitle: "From first idea to viewing",
        processIntro:
            "Selling or renting out your own home does not mean figuring out everything alone. ZelfWonen guides each step while you make the decisions.",
        steps: [
            [
                "01",
                "Tell us about your home",
                "Start with the address. We help you complete the important property details, features and documents.",
            ],
            [
                "02",
                "Build a strong listing",
                "Add photos and a floor plan, then create clear listing copy in Dutch or English.",
            ],
            [
                "03",
                "Choose price and reach",
                "Use the value estimate as your starting point and choose where your sale or rental listing appears.",
            ],
            [
                "04",
                "Host and decide yourself",
                "Run your own viewings, compare offers and decide who you want to move forward with.",
            ],
        ],
        featuresEyebrow: "You sell, we help",
        featuresTitle: "Everything for a strong property presentation",
        featuresIntro:
            "The practical tools of an estate agent, with the freedom and lower cost of selling your own home.",
        features: [
            [
                "Property details in one place",
                "Start faster with available address, parcel and energy-label data, then add what makes your home special.",
                "map",
            ],
            [
                "A smarter asking price",
                "Get a clear value estimate and range, so you can choose your asking price with greater confidence.",
                "chart",
            ],
            [
                "Copy that connects",
                "Turn your input into compelling Dutch or English listing copy, always under your control.",
                "bot",
            ],
            [
                "Photos and floor plans",
                "Present every room with photos and an interactive or fixed floor plan that works on any screen.",
                "building",
            ],
            [
                "Compare offers calmly",
                "See amounts, timing and conditions clearly before you make your decision.",
                "file",
            ],
            [
                "Reach through Funda and Kamernet",
                "Choose the right channel for a sale or rental and manage progress from one trusted place.",
                "sparkles",
            ],
        ],
        comparisonEyebrow: "Compare with an estate agent",
        comparisonTitle: "More control. Far lower agent fees.",
        comparisonIntro:
            "ZelfWonen is for owners searching for the cheapest broker or estate agent, but who mainly want control over their sale or rental. Here is what you pay and what you handle yourself.",
        comparisonLabels: ["ZelfWonen", "Estate agent"],
        comparisonRows: [
            ["Base cost", "€99 – €299", "Commission and often setup fees"],
            [
                "Funda or Kamernet",
                "You choose the placement. External channel fees may apply",
                "Often bundled into the package or charged separately",
            ],
            [
                "Property presentation",
                "You take photos and approve the listing yourself",
                "The agent usually coordinates this",
            ],
            [
                "Viewings",
                "You schedule and host them yourself",
                "The agent hosts them",
            ],
            [
                "Offers and decision",
                "You compare and decide with a clear overview",
                "The agent advises and negotiates",
            ],
            [
                "Indicative total cost",
                "From €99, excluding selected external placement",
                "Often €3,000 – €7,000+, depending on property and commission",
            ],
        ],
        comparisonHighlight:
            "Save on estate agent fees while staying in control of your home sale.",
        comparisonNote:
            "Indicative comparison, not a quote. Agent and channel fees vary by provider, region, property and package. Always check which external placements are included before paying.",
        faqEyebrow: "Frequently asked questions",
        faqTitle: "Selling it yourself, clearly explained",
        faqs: [
            [
                "Can I sell my home without an estate agent?",
                "Yes. As the owner, you can sell your own home. You handle the presentation, viewings and choice between offers. A civil-law notary is still required for the legal transfer in the Netherlands.",
            ],
            [
                "Can my property appear on Funda or Kamernet?",
                "From ZelfWonen you can choose a suitable distribution option. Funda is available for sales and rentals. For rentals, you can also choose Kamernet. Available channels and any placement fees are shown with your package.",
            ],
            [
                "What do I handle during viewings?",
                "You schedule appointments, welcome interested people and answer questions about the property. You know the home best. We help keep information and offers organised.",
            ],
        ],
        ctaTitle: "Your home. Your process. Your result.",
        ctaText:
            "Create a free account and discover how straightforward selling or renting out your own home can be.",
        footer: "© 2026 ZelfWonen. Built for the Dutch housing market.",
        footerLinks: ["Privacy", "Terms", "Contact"],
    },
} as const;

const metadataCopy = {
    nl: {
        title: "Zelf huis verkopen zonder makelaar | ZelfWonen",
        description:
            "Zelf je huis verkopen of verhuren vanaf €99. Maak je woningadvertentie, vergelijk biedingen en kies bereik via Funda of Kamernet.",
        keywords: [
            "zelf huis verkopen",
            "zelf huis verhuren",
            "huis verkopen zonder makelaar",
            "verkoopmakelaar",
            "goedkoopste makelaar",
            "woning op Funda plaatsen",
            "verhuren via Kamernet",
        ],
    },
    en: {
        title: "Sell Your Own Home Without an Agent | ZelfWonen",
        description:
            "Sell or rent out your own home from €99. Build your listing, compare offers and choose distribution through Funda or Kamernet.",
        keywords: [
            "sell your own home",
            "rent your own home out",
            "sell home without estate agent",
            "cheapest broker",
            "cheapest estate agent",
            "property listing Netherlands",
            "publish on Funda",
        ],
    },
} as const;

function getLanguage(lang?: string): "nl" | "en" {
    return lang === "en" ? "en" : "nl";
}

export async function generateMetadata({
    searchParams,
}: {
    searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
    const language = getLanguage((await searchParams).lang);
    const meta = metadataCopy[language];

    return {
        title: meta.title,
        description: meta.description,
        keywords: [...meta.keywords],
        alternates: {
            canonical: language === "en" ? "/?lang=en" : "/",
            languages: { nl: "/", en: "/?lang=en", "x-default": "/" },
        },
        openGraph: {
            type: "website",
            title: meta.title,
            description: meta.description,
            locale: language === "en" ? "en_GB" : "nl_NL",
            alternateLocale: language === "en" ? ["nl_NL"] : ["en_GB"],
        },
    };
}

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
        <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
            <span
                className={`grid size-8 shrink-0 place-items-center rounded-lg ${done ? "bg-brand/10 text-brand" : "bg-accent/55 text-brand-dark"}`}
            >
                <Icon size={16} />
            </span>
            <span className="flex-1 text-sm font-medium">{label}</span>
            {done ? (
                <Check size={16} className="shrink-0 text-brand" />
            ) : (
                <ArrowRight size={16} className="shrink-0 text-brand" />
            )}
        </div>
    );
}

export default async function Home({
    searchParams,
}: {
    searchParams: Promise<{ lang?: string }>;
}) {
    const language = getLanguage((await searchParams).lang);
    const t = copy[language];
    const progressIcons = [ShieldCheck, PiggyBank, Megaphone];
    const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Service",
                name: "ZelfWonen",
                serviceType:
                    language === "nl"
                        ? "Zelf huis verkopen of verhuren zonder makelaar"
                        : "Sell or rent out your own home without an estate agent",
                areaServed: { "@type": "Country", name: "Netherlands" },
                provider: { "@type": "Organization", name: "ZelfWonen" },
                offers: {
                    "@type": "AggregateOffer",
                    priceCurrency: "EUR",
                    lowPrice: "99",
                    highPrice: "299",
                    offerCount: "3",
                },
                availableLanguage: ["Dutch", "English"],
            },
            {
                "@type": "FAQPage",
                mainEntity: t.faqs.map(([question, answer]) => ({
                    "@type": "Question",
                    name: question,
                    acceptedAnswer: { "@type": "Answer", text: answer },
                })),
            },
        ],
    };

    return (
        <div lang={language} className="min-h-screen overflow-hidden">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(structuredData),
                }}
            />
            <header className="relative z-20 border-b border-brand/10 bg-background/90 backdrop-blur">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
                    <Link
                        href={`/?lang=${language}`}
                        className="flex items-center gap-2.5 font-semibold"
                        aria-label="ZelfWonen"
                    >
                        <span className="grid size-9 place-items-center rounded-xl bg-brand text-white shadow-sm">
                            <Building2 size={19} />
                        </span>
                        <span className="text-xl">
                            Zelf<span className="text-brand">Wonen</span>
                        </span>
                    </Link>
                    <nav className="hidden items-center gap-8 text-sm font-medium text-muted md:flex">
                        <Link
                            href="/zoeken"
                            className="font-semibold text-brand transition hover:text-brand-dark"
                        >
                            {language === "nl"
                                ? "Woning zoeken"
                                : "Find a home"}
                        </Link>
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
                            aria-label={
                                language === "nl"
                                    ? "Switch to English"
                                    : "Wissel naar Nederlands"
                            }
                        >
                            <Languages size={17} />{" "}
                            {language === "nl" ? "EN" : "NL"}
                        </Link>
                        <AuthActions language={language} />
                    </div>
                </div>
            </header>

            <main>
                <section className="hero-glow relative border-b border-brand/10 px-5 py-16 sm:py-20 lg:px-8 lg:py-10">
                    <div className="dot-grid absolute inset-y-0 right-0 -z-10 w-1/2 opacity-60 mask-[linear-gradient(to_left,black,transparent)]" />
                    <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.08fr_.92fr]">
                        <div className="min-w-0">
                            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-brand/15 bg-white/80 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand shadow-sm">
                                <BadgeCheck size={15} /> {t.eyebrow}
                            </div>
                            <h1 className="max-w-4xl text-balance text-4xl leading-[1.02] font-semibold wrap-break-word sm:text-6xl lg:text-7xl">
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
                            <div className="rounded-4xl border border-brand/10 bg-white p-4 shadow-[0_30px_80px_rgba(16,40,32,.15)] sm:p-5">
                                <div className="flex items-start justify-between gap-4 pb-4">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
                                            {t.listing.eyebrow}
                                        </p>
                                        <h2 className="mt-1 truncate text-lg font-semibold sm:text-xl">
                                            {t.listing.address}
                                        </h2>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                                        {t.listing.status}
                                    </span>
                                </div>
                                <HomeScene label={t.listing.sceneLabel} />
                                <div className="my-3 grid grid-cols-3 gap-2">
                                    {t.listing.stats.map(([label, value]) => (
                                        <div
                                            key={label}
                                            className="min-w-0 rounded-xl bg-background p-3"
                                        >
                                            <p className="truncate text-[10px] text-muted sm:text-[11px]">
                                                {label}
                                            </p>
                                            <p className="mt-1 font-semibold">
                                                {value}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                <div className="space-y-2">
                                    {t.listing.progress.map((label, index) => (
                                        <ProgressItem
                                            key={label}
                                            icon={progressIcons[index]}
                                            label={label}
                                            done={index < 2}
                                        />
                                    ))}
                                </div>
                                <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-xs">
                                    <span className="font-medium text-muted">
                                        {t.listing.channels}
                                    </span>
                                    <span className="font-semibold text-brand">
                                        Funda&nbsp;&nbsp;·&nbsp;&nbsp;Kamernet
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="border-b border-line bg-white px-5 py-10 lg:px-8">
                    <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
                        <div className="max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                                {t.channelsEyebrow}
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
                                {t.channelsTitle}
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-muted">
                                {t.channelsText}
                            </p>
                        </div>
                        <div
                            className="flex shrink-0 items-center gap-7"
                            aria-label="Funda and Kamernet"
                        >
                            <Image
                                src="/brands/funda.svg"
                                alt="Funda"
                                width={136}
                                height={50}
                                loading="eager"
                                unoptimized
                                className="h-11 w-auto object-contain"
                            />
                            <Image
                                src="/brands/kamernet.svg"
                                alt="Kamernet"
                                width={141}
                                height={41}
                                loading="eager"
                                unoptimized
                                className="h-10 w-auto object-contain"
                            />
                        </div>
                    </div>
                </section>

                <section id="werkwijze" className="px-5 py-24 lg:px-8 lg:py-32">
                    <div className="mx-auto max-w-7xl">
                        <div className="max-w-2xl">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
                                {t.processEyebrow}
                            </p>
                            <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
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
                                {t.featuresEyebrow}
                            </p>
                            <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
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

                <section
                    id="pakketten"
                    className="bg-white px-5 py-24 lg:px-8 lg:py-32"
                >
                    <div className="mx-auto max-w-7xl">
                        <div className="max-w-3xl">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
                                {t.comparisonEyebrow}
                            </p>
                            <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
                                {t.comparisonTitle}
                            </h2>
                            <p className="mt-5 text-lg leading-8 text-muted">
                                {t.comparisonIntro}
                            </p>
                        </div>

                        <div className="mt-12 overflow-hidden rounded-3xl border border-line">
                            <div className="hidden grid-cols-[1fr_1.2fr_1.2fr] bg-brand-dark text-white md:grid">
                                <div className="p-5" />
                                <div className="border-l border-white/10 p-5 text-lg font-semibold text-accent">
                                    {t.comparisonLabels[0]}
                                </div>
                                <div className="border-l border-white/10 p-5 text-lg font-semibold">
                                    {t.comparisonLabels[1]}
                                </div>
                            </div>
                            {t.comparisonRows.map(([label, self, agent]) => (
                                <div
                                    key={label}
                                    className="grid border-t border-line first:border-t-0 md:grid-cols-[1fr_1.2fr_1.2fr]"
                                >
                                    <div className="bg-background p-4 font-semibold md:p-5">
                                        {label}
                                    </div>
                                    <div className="border-t border-line p-4 text-sm leading-6 md:border-l md:border-t-0 md:p-5">
                                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-brand md:hidden">
                                            {t.comparisonLabels[0]}
                                        </span>
                                        <span className="flex gap-2">
                                            <Check
                                                className="mt-1 shrink-0 text-brand"
                                                size={16}
                                            />
                                            {self}
                                        </span>
                                    </div>
                                    <div className="border-t border-line p-4 text-sm leading-6 text-muted md:border-l md:border-t-0 md:p-5">
                                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-foreground md:hidden">
                                            {t.comparisonLabels[1]}
                                        </span>
                                        {agent}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-accent/45 p-5 sm:flex-row sm:items-center sm:p-6">
                            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white">
                                <PiggyBank size={21} />
                            </span>
                            <p className="font-semibold text-brand-dark">
                                {t.comparisonHighlight}
                            </p>
                        </div>
                        <p className="mt-4 max-w-4xl text-xs leading-5 text-muted">
                            {t.comparisonNote}
                        </p>
                    </div>
                </section>

                <section className="px-5 py-24 lg:px-8 lg:py-28">
                    <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.7fr_1.3fr]">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
                                {t.faqEyebrow}
                            </p>
                            <h2 className="mt-4 text-4xl font-semibold">
                                {t.faqTitle}
                            </h2>
                        </div>
                        <div className="divide-y divide-line border-y border-line">
                            {t.faqs.map(([question, answer]) => (
                                <details key={question} className="group py-6">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-semibold">
                                        {question}
                                        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-brand transition group-open:rotate-45">
                                            +
                                        </span>
                                    </summary>
                                    <p className="mt-4 max-w-2xl pr-12 text-sm leading-7 text-muted">
                                        {answer}
                                    </p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="start" className="px-5 pb-20 lg:px-8 lg:pb-28">
                    <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-accent px-7 py-14 sm:px-14 sm:py-16 lg:px-20">
                        <div className="dot-grid absolute inset-y-0 right-0 w-1/2 opacity-35" />
                        <div className="relative max-w-3xl">
                            <Handshake className="mb-7 text-brand" size={30} />
                            <h2 className="text-4xl font-semibold text-brand-dark sm:text-5xl">
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
                    <p>{t.footer}</p>
                    <div className="flex gap-6">
                        {t.footerLinks.map((label) => (
                            <a
                                key={label}
                                href="#"
                                className="transition hover:text-brand"
                            >
                                {label}
                            </a>
                        ))}
                    </div>
                </div>
            </footer>
        </div>
    );
}
