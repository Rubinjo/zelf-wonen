import Link from "next/link";
import {
    ArrowRight,
    CheckCircle2,
    Clock3,
    FileText,
    Handshake,
    MessageSquare,
} from "lucide-react";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { listUserTransactions } from "@/features/transactions/transaction-service";

const statusNames: Record<string, string> = {
    ACTIVE: "Actief",
    CONTRACT_PENDING: "Contract voorbereiden",
    CONDITIONS_PENDING: "Voorwaarden afronden",
    READY_FOR_TRANSFER: "Klaar voor overdracht",
    COMPLETED: "Afgerond",
    CANCELLED: "Geannuleerd",
};

export default async function TransactionsPage() {
    const session = await requireEmailVerifiedUser();
    const transactions = await listUserTransactions(session.user.id);
    return (
        <div>
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">
                        Begeleide overdracht
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                        Mijn transacties
                    </h1>
                    <p className="mt-3 max-w-2xl text-muted">
                        Alle afspraken, documenten en deadlines tussen koper en
                        verkoper op één beveiligde plek.
                    </p>
                </div>
                <Handshake className="hidden text-brand sm:block" size={42} />
            </div>
            {transactions.length === 0 ? (
                <section className="mt-10 grid min-h-80 place-items-center border border-dashed border-brand/25 bg-white px-6 text-center">
                    <div className="max-w-md">
                        <Handshake className="mx-auto text-brand" size={36} />
                        <h2 className="mt-5 text-xl font-semibold">
                            Nog geen actieve transactie
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted">
                            Na acceptatie van een bod wordt hier automatisch een
                            ruimte voor koper en verkoper geopend.
                        </p>
                    </div>
                </section>
            ) : (
                <section className="mt-8 grid gap-4 lg:grid-cols-2">
                    {transactions.map((transaction) => {
                        const completed = transaction.milestones.filter(
                            (item) =>
                                item.status === "COMPLETED" ||
                                item.status === "WAIVED",
                        ).length;
                        const progress = Math.round(
                            (completed / transaction.milestones.length) * 100,
                        );
                        const role =
                            transaction.sellerUserId === session.user.id
                                ? "Verkoper"
                                : "Koper";
                        return (
                            <Link
                                key={transaction.id}
                                href={`/dashboard/transacties/${transaction.id}`}
                                className="group border border-line bg-white p-6 transition hover:border-brand/40 hover:shadow-lg"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                                            {role} ·{" "}
                                            {statusNames[transaction.status]}
                                        </p>
                                        <h2 className="mt-2 text-xl font-semibold">
                                            {
                                                transaction.listing.property
                                                    .street
                                            }{" "}
                                            {
                                                transaction.listing.property
                                                    .houseNumber
                                            }
                                            {
                                                transaction.listing.property
                                                    .houseNumberAddition
                                            }
                                        </h2>
                                        <p className="mt-1 text-sm text-muted">
                                            {
                                                transaction.listing.property
                                                    .postcode
                                            }{" "}
                                            {transaction.listing.property.city}
                                        </p>
                                    </div>
                                    <ArrowRight
                                        className="shrink-0 text-brand transition group-hover:translate-x-1"
                                        size={21}
                                    />
                                </div>
                                <div className="mt-5 h-2 overflow-hidden rounded-full bg-background">
                                    <div
                                        className="h-full bg-brand"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <div className="mt-2 flex justify-between text-xs text-muted">
                                    <span>
                                        {completed} van{" "}
                                        {transaction.milestones.length} stappen
                                    </span>
                                    <span>{progress}%</span>
                                </div>
                                <div className="mt-5 flex flex-wrap gap-4 border-t border-line pt-4 text-xs text-muted">
                                    <span className="inline-flex items-center gap-1.5">
                                        <MessageSquare size={14} />{" "}
                                        {transaction._count.messages} berichten
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <FileText size={14} />{" "}
                                        {transaction._count.documents}{" "}
                                        documenten
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        {transaction.status === "COMPLETED" ? (
                                            <CheckCircle2 size={14} />
                                        ) : (
                                            <Clock3 size={14} />
                                        )}{" "}
                                        Bijgewerkt{" "}
                                        {transaction.updatedAt.toLocaleDateString(
                                            "nl-NL",
                                        )}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </section>
            )}
        </div>
    );
}
