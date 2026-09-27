"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calculator, Languages } from "lucide-react";
import { AuthActions } from "@/components/auth/auth-actions";
import { BrandLogo } from "@/components/platform/brand-logo";
import { ThemeToggle } from "@/components/platform/theme-toggle";
import { setLanguage, type Language } from "@/lib/language-store";

export function PublicHeader({ language }: { language: Language }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const isEn = language === "en";
    const requestedLanguage = searchParams.get("lang");

    useEffect(() => {
        if (requestedLanguage === "nl" || requestedLanguage === "en") {
            setLanguage(requestedLanguage);
        }
    }, [requestedLanguage]);
    const links = [
        { href: "/search", label: isEn ? "Find a home" : "Woning zoeken" },
        { href: "/mortgage-calculator", label: isEn ? "Mortgage calculator" : "Hypotheek berekenen" },
    ];

    function switchLanguage() {
        const next = isEn ? "nl" : "en";
        setLanguage(next);
        const query = new URLSearchParams(searchParams.toString());
        // Explicit language URLs on public detail pages must follow the preference too.
        if (query.has("lang")) {
            query.set("lang", next);
            router.replace(pathname + "?" + query.toString(), { scroll: false });
        } else {
            router.refresh();
        }
    }

    return (
        <header className="border-b border-line bg-background/92 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center" aria-label="ZelfWonen">
                    <BrandLogo className="h-9 w-auto" priority />
                </Link>
                <nav aria-label={isEn ? "Main navigation" : "Hoofdnavigatie"} className="order-3 flex w-full items-center justify-start gap-6 border-t border-line pt-3 text-sm font-semibold lg:order-none lg:mr-auto lg:w-auto lg:border-0 lg:pt-0">
                    {links.map(({ href, label }) => (
                        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={"inline-flex items-center gap-1.5 " + (pathname === href ? "text-brand" : "text-muted hover:text-brand")}>
                            {href === "/mortgage-calculator" ? <Calculator size={16} /> : null}
                            {label}
                        </Link>
                    ))}
                </nav>
                <div className="flex items-center gap-1 sm:gap-2">
                    <button type="button" onClick={switchLanguage} aria-label={isEn ? "Wissel naar Nederlands" : "Switch to English"} className="flex min-h-10 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted hover:text-brand">
                        <Languages size={17} /> {isEn ? "NL" : "EN"}
                    </button>
                    <ThemeToggle />
                    <AuthActions language={language} dashboardHref="/dashboard/seeker" dashboardLabel={isEn ? "My dashboard" : "Mijn dashboard"} />
                </div>
            </div>
        </header>
    );
}
