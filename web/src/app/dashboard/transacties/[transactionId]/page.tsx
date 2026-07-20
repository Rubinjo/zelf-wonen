import { notFound } from "next/navigation";
import { z } from "zod";
import { TransactionRoom } from "@/components/transactions/transaction-room";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import {
    getTransactionRoom,
    TransactionAccessError,
} from "@/features/transactions/transaction-service";

export default async function TransactionPage({
    params,
}: {
    params: Promise<{ transactionId: string }>;
}) {
    const session = await requireEmailVerifiedUser();
    const parsed = z
        .string()
        .uuid()
        .safeParse((await params).transactionId);
    if (!parsed.success) notFound();
    let initialRoom;
    try {
        const room = await getTransactionRoom(parsed.data, session.user.id);
        initialRoom = JSON.parse(
            JSON.stringify(room, (_key, value) =>
                typeof value === "bigint" ? value.toString() : value,
            ),
        );
    } catch (error) {
        if (error instanceof TransactionAccessError) notFound();
        throw error;
    }
    return (
        <TransactionRoom
            initialRoom={initialRoom}
            currentUserId={session.user.id}
        />
    );
}
