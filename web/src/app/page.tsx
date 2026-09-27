import { getLanguage } from "@/lib/language";
import { PublicHeader } from "@/components/platform/public-header";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowDown,
    ArrowRight,
    ArrowUpRight,
    Calculator,
    Check,
    ChevronDown,
    ExternalLink,
    House,
    Leaf,
    MapPinned,
    Sparkles,
} from "lucide-react";
import { AuthActions } from "@/components/auth/auth-actions";
import { HomeScene } from "@/components/marketing/home-scene";
import { HomeSearch } from "@/components/marketing/home-search";
import { BrandLogo } from "@/components/platform/brand-logo";

const copy = {
    nl: {
        search: "Woning zoeken",
        sell: "Woning aanbieden",
        about: "Zoeken met AI",
        skip: "Naar de inhoud",
        title: "Er is een plek",
        titleAccent: "die bij je past.",
        intro: "Ontdek koop- en huurwoningen uit verschillende bronnen. Combineer een breed woningoverzicht met slimme AI en de informatie die je helpt kiezen.",
        browse: "Ontdek het woningaanbod",
        noAccount: "Vrij zoeken, zonder account",
        sceneLabel:
            "Isometrische illustratie van een woonkamer met bank, werkplek en planten",
        sceneCaption: "Een huis is meer dan vier muren.",
        sceneSub: "Vind de ruimte voor jouw leven.",
        illustration: "Woonimpressie · geen echte advertentie",
        sceneTags: [
            "Ruimte om te leven",
            "Energie & comfort",
            "Een buurt die past",
        ],
        sourcesLabel: "Aanbod uit meerdere bronnen",
        sourcesNote:
            "Waaronder Funda, Kamernet en particuliere aanbieders op ZelfWonen.",
        sourceRule:
            "Bij extern aanbod ga je naar de oorspronkelijke advertentie.",
        exploreLabel: "Jouw zoektocht begint hier",
        exploreTitle: "Een nieuwe plek. Op jouw manier.",
        paths: [
            [
                "01 / KOPEN",
                "Ruimte voor je volgende stap",
                "Van eerste appartement tot een huis met tuin. Ontdek de koopwoningen.",
                "Bekijk koopwoningen",
            ],
            [
                "02 / HUREN",
                "Een plek voor nu. Of langer.",
                "Verken het huuraanbod en verfijn op de plek, prijs en ruimte die je zoekt.",
                "Bekijk huurwoningen",
            ],
        ],
        aiLabel: "AI als vertrekpunt. Jij aan het stuur.",
        aiTitle: "Begin met een wens.\nMaak er een zoektocht van.",
        aiSteps: [
            [
                "Vertel wat je zoekt",
                "Een plaats, een budget, een tuin. Beschrijf wat voor jou een fijne woning maakt.",
            ],
            [
                "AI vertaalt je wensen",
                "Je omschrijving wordt omgezet naar zoekfilters voor het woningaanbod.",
            ],
            [
                "Verken en verfijn",
                "Bekijk de resultaten op de zoekpagina, pas filters aan en open een woning voor meer informatie.",
            ],
        ],
        aiCta: "Probeer AI-zoeken",
        exampleLabel: "Bijvoorbeeld",
        example: "Een koophuis in Utrecht, met een tuin, tot € 500.000",
        filters: ["Utrecht", "Te koop", "Tot € 500.000", "Met tuin"],
        filtersLabel: "Van jouw woorden naar zoekfilters",
        aiNote: "Controleer de filters en pas ze aan. Jij bepaalt wat past.",
        sellLabel: "Ook voor woningeigenaren",
        sellTitle: "Jouw woning,\niemand anders’ nieuwe begin.",
        sellText:
            "Zelf verkopen of verhuren? Maak je eigen woningadvertentie op ZelfWonen. Voeg foto's en kenmerken toe en beheer je woning vanuit je eigen dashboard.",
        sellCta: "Bied je woning aan",
        sellNote: "Je advertentie op ZelfWonen, onder jouw regie.",
        calculator: "Wat past bij je budget?",
        calculatorText: "Verken je mogelijkheden met de hypotheekcalculator.",
        calculatorCta: "Bereken je hypotheek",
        faqTitle: "Goed om te weten",
        faqs: [
            [
                "Waar komen de woningen vandaan?",
                "ZelfWonen brengt woningaanbod uit bronnen zoals Funda en Kamernet samen met woningen die eigenaren zelf op ZelfWonen aanbieden. Zo kun je verschillende bronnen vanuit één zoekomgeving verkennen.",
            ],
            [
                "Waar reageer ik op een woning?",
                "Bij een externe woning verwijzen we je naar de oorspronkelijke advertentie. Daar vind je de actuele informatie en de mogelijkheden om contact op te nemen. Voor woningen op ZelfWonen gebruik je de beschikbare contactopties bij de advertentie.",
            ],
            [
                "Hoe werkt zoeken met AI?",
                "Beschrijf je woonwensen in gewone taal. AI vertaalt die naar zoekfilters. Op de zoekpagina kun je de resultaten bekijken en de filters zelf aanpassen. Niet iedere wens kan als filter worden verwerkt.",
            ],
            [
                "Kan ik ook mijn eigen woning aanbieden?",
                "Ja. Je kunt via je account een woningadvertentie maken voor verkoop of verhuur op ZelfWonen en deze zelf beheren.",
            ],
        ],
        footer: "Meer overzicht. Dichter bij thuis.",
        footerNote: "Voor de Nederlandse woningmarkt.",
        metaTitle: "Woningen ontdekken met AI",
        metaDescription:
            "Ontdek koop- en huurwoningen uit bronnen zoals Funda en Kamernet. Zoek met AI, verken woninginformatie of bied je eigen woning aan op ZelfWonen.",
    },
    en: {
        search: "Find a home",
        sell: "List a property",
        about: "Search with AI",
        skip: "Skip to content",
        title: "There’s a place",
        titleAccent: "that fits your life.",
        intro: "Discover homes for sale and rent from different sources. Bring a broad view of the market together with smart AI and the information that helps you choose.",
        browse: "Explore all homes",
        noAccount: "Browse freely, no account needed",
        sceneLabel:
            "Isometric illustration of a living room with a sofa, workspace and plants",
        sceneCaption: "A home is more than four walls.",
        sceneSub: "Find room for your life.",
        illustration: "Living space illustration · not an actual listing",
        sceneTags: [
            "Room to live",
            "Energy & comfort",
            "A neighbourhood that fits",
        ],
        sourcesLabel: "Listings from multiple sources",
        sourcesNote:
            "Including Funda, Kamernet and private owners on ZelfWonen.",
        sourceRule:
            "For external listings, we link to the original advertisement.",
        exploreLabel: "Your search starts here",
        exploreTitle: "A new place. Your own way.",
        paths: [
            [
                "01 / BUY",
                "Room for your next chapter",
                "From a first apartment to a house with a garden. Explore homes for sale.",
                "Explore homes for sale",
            ],
            [
                "02 / RENT",
                "For now. Or for longer.",
                "Explore rentals and narrow your search by location, price and space.",
                "Explore homes for rent",
            ],
        ],
        aiLabel: "AI gets you started. You stay in control.",
        aiTitle: "Start with a wish.\nTurn it into a search.",
        aiSteps: [
            [
                "Tell us what you want",
                "A location, a budget, a garden. Describe what makes a home right for you.",
            ],
            [
                "AI translates your wishes",
                "Your description becomes search filters for the housing listings.",
            ],
            [
                "Explore and refine",
                "Explore results on the search page, adjust the filters and open a property to learn more.",
            ],
        ],
        aiCta: "Try AI search",
        exampleLabel: "For example",
        example: "A house for sale in Utrecht, with a garden, under € 500,000",
        filters: ["Utrecht", "For sale", "Up to € 500,000", "With a garden"],
        filtersLabel: "From your words to search filters",
        aiNote: "Check and adjust the filters. You decide what fits.",
        sellLabel: "For property owners, too",
        sellTitle: "Your home.\nSomeone’s new beginning.",
        sellText:
            "Selling or renting out your home? Create your own listing on ZelfWonen. Add photos and property details, and manage your home from your dashboard.",
        sellCta: "List your property",
        sellNote: "Your listing on ZelfWonen. You’re in control.",
        calculator: "What fits your budget?",
        calculatorText: "Explore your options with the mortgage calculator.",
        calculatorCta: "Calculate your mortgage",
        faqTitle: "Good to know",
        faqs: [
            [
                "Where do the listings come from?",
                "ZelfWonen brings together housing listings from sources such as Funda and Kamernet, alongside properties listed directly by owners on ZelfWonen. Explore different sources in one search experience.",
            ],
            [
                "How do I contact an advertiser?",
                "For external properties, we link to the original advertisement for current information and contact options. For properties on ZelfWonen, use the contact options available on the listing.",
            ],
            [
                "How does AI search work?",
                "Describe your wishes in everyday language. AI turns them into search filters. View the results and adjust the filters yourself on the search page. Not every preference can be translated into a filter.",
            ],
            [
                "Can I list my own property?",
                "Yes. Use your account to create and manage a property listing for sale or rent on ZelfWonen.",
            ],
        ],
        footer: "A wider view. A little closer to home.",
        footerNote: "Built for the Dutch housing market.",
        metaTitle: "Discover homes with AI",
        metaDescription:
            "Discover homes for sale and rent from sources such as Funda and Kamernet. Search with AI, explore property information or list your own home on ZelfWonen.",
    },
} as const;

type PageProps = { searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({
    searchParams,
}: PageProps): Promise<Metadata> {
    const requestedLanguage = (await searchParams).lang;
    const language = requestedLanguage === "en" || requestedLanguage === "nl"
        ? requestedLanguage
        : await getLanguage();
    const t = copy[language];
    return {
        title: t.metaTitle,
        description: t.metaDescription,
        alternates: {
            canonical: language === "en" ? "/?lang=en" : "/",
            languages: { nl: "/", en: "/?lang=en", "x-default": "/" },
        },
        openGraph: {
            type: "website",
            title: t.metaTitle + " | ZelfWonen",
            description: t.metaDescription,
            locale: language === "en" ? "en_GB" : "nl_NL",
        },
    };
}

export default async function Home({ searchParams }: PageProps) {
    const requestedLanguage = (await searchParams).lang;
    const language = requestedLanguage === "en" || requestedLanguage === "nl"
        ? requestedLanguage
        : await getLanguage();
    const t = copy[language];
    return (
        <div className="home-page min-h-screen bg-background" lang={language}>
            <a
                href="#main-content"
                className="sr-only z-50 rounded-lg bg-surface p-4 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
                {t.skip}
            </a>
            <PublicHeader language={language} />
            <main id="main-content">
                <section
                    className="home-shell grid items-center gap-10 pb-12 pt-12 sm:pt-16 lg:grid-cols-[1.08fr_1fr] lg:gap-14 lg:pb-16 lg:pt-20"
                    aria-labelledby="hero-title"
                >
                    <div className="min-w-0">
                        <h1
                            id="hero-title"
                            className="text-[clamp(2.65rem,5.2vw,4.75rem)] leading-[1.06] font-medium tracking-[-0.055em]"
                        >
                            {t.title}
                            <br />
                            <span className="text-brand">{t.titleAccent}</span>
                        </h1>
                        <p className="mb-7 mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
                            {t.intro}
                        </p>
                        <HomeSearch language={language} />
                        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                            <Link href="/search" className="home-text-link">
                                {t.browse}
                                <ArrowRight size={17} aria-hidden="true" />
                            </Link>
                            <span className="text-xs text-muted">
                                {t.noAccount}
                            </span>
                        </div>
                    </div>
                    <div className="home-scene-composition relative min-w-0 overflow-hidden rounded-[2rem] border border-line bg-[#e9ede3] dark:bg-[#18271f]">
                        <div className="relative z-10 px-7 pt-7 sm:px-9 sm:pt-9">
                            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-muted">
                                ZelfWonen /{" "}
                                {language === "nl"
                                    ? "Thuis begint hier"
                                    : "Home starts here"}
                            </p>
                            <p className="mt-4 max-w-72 text-2xl leading-tight font-medium tracking-tight sm:text-3xl">
                                {t.sceneCaption}
                            </p>
                            <p className="mt-2 text-sm text-muted">
                                {t.sceneSub}
                            </p>
                        </div>
                        <div className="relative mt-2">
                            <div
                                className="home-scene-orbit"
                                aria-hidden="true"
                            />
                            <HomeScene
                                label={t.sceneLabel}
                                className="relative h-72 w-full sm:h-96 lg:h-[23rem]"
                            />
                        </div>
                        <div className="relative z-10 mx-5 mb-5 rounded-2xl border border-white/50 bg-surface/90 p-4 sm:mx-7 sm:mb-7">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                                <Sparkles
                                    size={16}
                                    className="text-brand"
                                    aria-hidden="true"
                                />
                                {language === "nl"
                                    ? "Wat maakt een huis jouw thuis?"
                                    : "What makes a house your home?"}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {t.sceneTags.map((tag, i) => {
                                    const Icon = [House, Leaf, MapPinned][i];
                                    return (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1.5 text-[11px] text-muted"
                                        >
                                            <Icon
                                                size={13}
                                                className="text-brand"
                                                aria-hidden="true"
                                            />
                                            {tag}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                        <p className="pb-4 text-center text-[10px] text-muted">
                            {t.illustration}
                        </p>
                    </div>
                </section>
                <section
                    className="border-y border-line bg-surface"
                    aria-label={t.sourcesLabel}
                >
                    <div className="home-shell grid gap-7 py-7 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div>
                            <p className="text-sm font-semibold">
                                {t.sourcesLabel}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-muted">
                                {t.sourcesNote}
                            </p>
                            <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-muted">
                                <ExternalLink
                                    size={12}
                                    className="mt-1 shrink-0"
                                    aria-hidden="true"
                                />
                                {t.sourceRule}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-6 sm:gap-9">
                            <span className="rounded-lg bg-white px-3 py-2">
                                <Image
                                    src="/brands/funda.svg"
                                    alt="Funda"
                                    width={82}
                                    height={28}
                                    className="h-7 w-20 object-contain"
                                />
                            </span>
                            <span className="rounded-lg bg-white px-3 py-2">
                                <Image
                                    src="/brands/kamernet.svg"
                                    alt="Kamernet"
                                    width={102}
                                    height={28}
                                    className="h-7 w-25 object-contain"
                                />
                            </span>
                            <BrandLogo className="h-9 w-auto" />
                        </div>
                    </div>
                </section>
                <section
                    className="home-shell py-16 sm:py-24"
                    aria-labelledby="explore-title"
                >
                    <p className="home-eyebrow">{t.exploreLabel}</p>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
                        <h2 id="explore-title" className="home-heading">
                            {t.exploreTitle}
                        </h2>
                        <Link href="/search" className="home-text-link">
                            {t.browse}
                            <ArrowUpRight size={17} aria-hidden="true" />
                        </Link>
                    </div>
                    <div className="mt-8 grid gap-5 md:grid-cols-2">
                        {t.paths.map(([label, title, description, cta], i) => (
                            <Link
                                key={label}
                                href={
                                    i === 0
                                        ? "/search?purpose=SALE"
                                        : "/search?purpose=RENT"
                                }
                                className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-7 transition hover:border-brand sm:p-9"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold tracking-[0.14em] text-brand">
                                        {label}
                                    </span>
                                    <span className="grid size-11 place-items-center rounded-full bg-background text-brand transition group-hover:bg-accent group-hover:text-brand-dark">
                                        <ArrowUpRight
                                            size={22}
                                            aria-hidden="true"
                                        />
                                    </span>
                                </div>
                                <h3 className="mt-7 text-2xl font-medium tracking-tight">
                                    {title}
                                </h3>
                                <p className="mt-3 max-w-md text-sm leading-7 text-muted">
                                    {description}
                                </p>
                                <span className="mt-7 inline-block text-sm font-semibold text-brand">
                                    {cta}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
                <section
                    id="ai-search"
                    className="home-shell scroll-mt-8 border-t border-line py-16 sm:py-24"
                    aria-labelledby="ai-title"
                >
                    <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
                        <div>
                            <p className="home-eyebrow">
                                <Sparkles size={16} aria-hidden="true" />
                                {t.aiLabel}
                            </p>
                            <h2
                                id="ai-title"
                                className="home-heading mt-4 whitespace-pre-line"
                            >
                                {t.aiTitle}
                            </h2>
                            <ol className="mt-8 space-y-6">
                                {t.aiSteps.map(([title, description], i) => (
                                    <li key={title} className="flex gap-4">
                                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-xs font-semibold text-brand">
                                            {i + 1}
                                        </span>
                                        <div>
                                            <h3 className="text-sm font-semibold">
                                                {title}
                                            </h3>
                                            <p className="mt-1 max-w-md text-sm leading-7 text-muted">
                                                {description}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                            <a
                                href="#home-query"
                                className="home-text-link mt-8"
                            >
                                {t.aiCta}
                                <ArrowRight size={17} aria-hidden="true" />
                            </a>
                        </div>
                        <div className="flex flex-col justify-center rounded-[2rem] bg-[#064a3a] p-7 text-white sm:p-10">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b3cec3]">
                                {t.exampleLabel}
                            </p>
                            <blockquote className="mt-5 text-2xl leading-relaxed font-medium tracking-tight sm:text-3xl">
                                “{t.example}”
                            </blockquote>
                            <ArrowDown
                                className="my-7 text-accent"
                                size={26}
                                aria-hidden="true"
                            />
                            <p className="text-xs font-medium text-[#b3cec3]">
                                {t.filtersLabel}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {t.filters.map((filter) => (
                                    <span
                                        key={filter}
                                        className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
                                    >
                                        <Check
                                            size={14}
                                            className="text-accent"
                                            aria-hidden="true"
                                        />
                                        {filter}
                                    </span>
                                ))}
                            </div>
                            <p className="mt-7 border-t border-white/20 pt-5 text-xs leading-6 text-[#b3cec3]">
                                {t.aiNote}
                            </p>
                        </div>
                    </div>
                </section>
                <section
                    id="start"
                    className="home-shell scroll-mt-8"
                    aria-labelledby="sell-title"
                >
                    <div className="grid gap-8 rounded-[2rem] border border-brand/15 bg-brand/5 p-7 sm:p-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-20">
                        <div>
                            <p className="home-eyebrow">
                                <House size={16} aria-hidden="true" />
                                {t.sellLabel}
                            </p>
                            <h2
                                id="sell-title"
                                className="home-heading mt-4 whitespace-pre-line"
                            >
                                {t.sellTitle}
                            </h2>
                        </div>
                        <div className="self-center">
                            <p className="text-base leading-8 text-muted">
                                {t.sellText}
                            </p>
                            <AuthActions
                                language={language}
                                placement="cta"
                                dashboardHref="/dashboard/listings/new"
                                ctaLabel={t.sellCta}
                            />
                            <p className="mt-3 text-xs text-muted">
                                {t.sellNote}
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/mortgage-calculator"
                        className="group flex flex-wrap items-center gap-5 border-b border-line px-2 py-8 sm:px-6"
                    >
                        <span className="grid size-12 place-items-center rounded-full bg-surface text-brand">
                            <Calculator size={23} aria-hidden="true" />
                        </span>
                        <div className="flex-1 basis-48">
                            <h3 className="font-semibold">{t.calculator}</h3>
                            <p className="mt-1 text-sm leading-6 text-muted">
                                {t.calculatorText}
                            </p>
                        </div>
                        <span className="home-text-link">
                            {t.calculatorCta}
                            <ArrowUpRight size={18} aria-hidden="true" />
                        </span>
                    </Link>
                </section>
                <section
                    className="home-shell grid gap-8 py-16 sm:py-24 lg:grid-cols-[.7fr_1.3fr] lg:gap-20"
                    aria-labelledby="faq-title"
                >
                    <h2 id="faq-title" className="home-heading">
                        {t.faqTitle}
                    </h2>
                    <div className="border-t border-line">
                        {t.faqs.map(([question, answer]) => (
                            <details
                                key={question}
                                className="group border-b border-line"
                            >
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-base font-medium [&::-webkit-details-marker]:hidden">
                                    {question}
                                    <ChevronDown
                                        size={18}
                                        className="shrink-0 text-brand transition group-open:rotate-180 motion-reduce:transition-none"
                                        aria-hidden="true"
                                    />
                                </summary>
                                <p className="max-w-2xl pb-6 pr-6 text-sm leading-7 text-muted">
                                    {answer}
                                </p>
                            </details>
                        ))}
                    </div>
                </section>
            </main>
            <footer className="border-t border-line bg-surface">
                <div className="home-shell flex flex-wrap items-center justify-between gap-7 py-9">
                    <div>
                        <p className="text-xl font-semibold tracking-tight">
                            Zelf<span className="text-brand">Wonen</span>
                        </p>
                        <p className="mt-2 text-sm text-muted">{t.footer}</p>
                    </div>
                    <nav
                        aria-label="Footer"
                        className="flex flex-wrap gap-x-6 gap-y-3 text-sm"
                    >
                        <Link href="/search" className="text-brand">
                            {t.search}
                        </Link>
                        <Link href="#start">{t.sell}</Link>
                        <Link href="/mortgage-calculator">
                            {t.calculatorCta}
                        </Link>
                    </nav>
                    <p className="w-full border-t border-line pt-5 text-xs text-muted">
                        © {new Date().getFullYear()} ZelfWonen. {t.footerNote}
                    </p>
                </div>
            </footer>
        </div>
    );
}
