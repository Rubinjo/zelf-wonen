import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-provider";
import { getLanguage } from "@/lib/language";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

const metaCopy = {
    nl: {
        title: "ZelfWonen — Zelf verkopen of verhuren",
        description:
            "Maak, waardeer en publiceer je woning zelf — met betrouwbare woningdata en een transparant biedlogboek.",
    },
    en: {
        title: "ZelfWonen — Sell or rent out your own home",
        description:
            "Create, value and publish your property yourself — with reliable property data and a transparent bid logbook.",
    },
} as const;

export async function generateMetadata(): Promise<Metadata> {
    const lang = await getLanguage();
    const m = metaCopy[lang];
    return {
        title: {
            default: m.title,
            template: "%s | ZelfWonen",
        },
        description: m.description,
        icons: {
            icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
        },
    };
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const lang = await getLanguage();
    return (
        <html
            lang={lang}
            data-scroll-behavior="smooth"
            suppressHydrationWarning
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="flex min-h-full flex-col">
                <Script
                    id="theme-init"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var t=window.localStorage.getItem("zelfwonen:theme")||"system";var dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(dark){r.classList.add("dark")}else{r.classList.remove("dark")}r.style.colorScheme=dark?"dark":"light"}catch(e){}})();`,
                    }}
                />
                <ThemeProvider>
                    <LanguageProvider>
                        <QueryProvider>{children}</QueryProvider>
                    </LanguageProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
