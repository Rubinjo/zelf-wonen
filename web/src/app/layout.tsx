import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
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

export const metadata: Metadata = {
    title: {
        default: "ZelfWonen — Zelf verkopen of verhuren",
        template: "%s | ZelfWonen",
    },
    description:
        "Maak, waardeer en publiceer je woning zelf — met betrouwbare woningdata en een transparant biedlogboek.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="nl"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="flex min-h-full flex-col">
                <QueryProvider>{children}</QueryProvider>
            </body>
        </html>
    );
}
