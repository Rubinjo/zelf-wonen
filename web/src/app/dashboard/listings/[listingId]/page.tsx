import { notFound } from "next/navigation";
import { z } from "zod";
import {
    ListingEditor,
    type ListingView,
} from "@/components/listing/listing-editor";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { getOwnerListing } from "@/features/listings/listing-service";
import { getOwnerListingMessageSummary } from "@/features/messages/listing-messages-service";

export default async function ListingPage({
    params,
}: {
    params: Promise<{ listingId: string }>;
}) {
    const session = await requireEmailVerifiedUser();
    const parsed = z
        .string()
        .uuid()
        .safeParse((await params).listingId);
    if (!parsed.success) notFound();
    const [listing, messages] = await Promise.all([
        getOwnerListing(session.user.id, parsed.data),
        getOwnerListingMessageSummary(session.user.id, parsed.data),
    ]);
    if (!listing) notFound();
    return (
        <ListingEditor
            initialListing={listing as ListingView}
            messageUnreadCount={messages?.unreadIncoming ?? 0}
        />
    );
}
