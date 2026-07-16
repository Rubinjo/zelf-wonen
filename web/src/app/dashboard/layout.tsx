import Link from "next/link";
import { Building2, Home, Plus, Settings, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { PlatformSignOut } from "@/components/platform/platform-sign-out";
import { requireEmailVerifiedUser } from "@/features/auth/guards";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    let session;
    try {
        session = await requireEmailVerifiedUser();
    } catch {
        redirect("/");
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 border-b border-line bg-background/92 backdrop-blur-xl">
                <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-2.5 font-semibold tracking-tight"
                    >
                        <span className="grid size-9 place-items-center rounded-xl bg-brand text-white">
                            <Building2 size={19} />
                        </span>
                        <span className="text-lg">
                            Zelf<span className="text-brand">Wonen</span>
                        </span>
                    </Link>
                    <nav
                        className="hidden items-center gap-2 md:flex"
                        aria-label="Platform navigation"
                    >
                        <Link
                            href="/dashboard"
                            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold hover:bg-white"
                        >
                            <Home size={16} /> Woningen
                        </Link>
                        <Link
                            href="/dashboard/listings/new"
                            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                        >
                            <Plus size={16} /> Nieuwe woning
                        </Link>
                        <Link
                            href="/dashboard/account"
                            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold hover:bg-white"
                        >
                            <Settings size={16} /> Beveiliging
                        </Link>
                    </nav>
                    <div className="flex items-center gap-3">
                        <span className="hidden items-center gap-2 text-xs text-muted lg:flex">
                            <ShieldCheck size={15} className="text-brand" />{" "}
                            {session.user.email}
                        </span>
                        <PlatformSignOut />
                    </div>
                </div>
            </header>
            <main className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
                {children}
            </main>
            <nav className="fixed inset-x-4 bottom-4 z-40 flex justify-around rounded-2xl border border-line bg-white/95 p-2 shadow-xl backdrop-blur md:hidden">
                <Link
                    href="/dashboard"
                    className="grid min-w-20 place-items-center gap-1 p-2 text-xs font-semibold"
                >
                    <Home size={18} /> Woningen
                </Link>
                <Link
                    href="/dashboard/listings/new"
                    className="grid min-w-20 place-items-center gap-1 rounded-xl bg-brand p-2 text-xs font-semibold text-white"
                >
                    <Plus size={18} /> Nieuw
                </Link>
                <Link
                    href="/dashboard/account"
                    className="grid min-w-20 place-items-center gap-1 p-2 text-xs font-semibold"
                >
                    <Settings size={18} /> Account
                </Link>
            </nav>
        </div>
    );
}
