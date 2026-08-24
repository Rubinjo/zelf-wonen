import { ListingCreateWizard } from "@/components/listing/listing-create-wizard";
import { NewListingEditor } from "@/components/listing/new-listing-editor";

export default async function NewListingPage({
    searchParams,
}: {
    searchParams: Promise<{ create?: string }>;
}) {
    const { create } = await searchParams;
    return create === "1" ? <NewListingEditor /> : <ListingCreateWizard />;
}
