import { SeekerDashboard } from "@/components/seeker/seeker-dashboard";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { listUserMessageThreads } from "@/features/messages/listing-messages-service";
import { getSeekerDashboard } from "@/features/seeker/seeker-service";

export default async function SeekerDashboardPage() {
    const session = await requireEmailVerifiedUser();
    const [dashboard, messageThreads] = await Promise.all([
        getSeekerDashboard(session.user.id),
        listUserMessageThreads(session.user.id),
    ]);
    const initialData = JSON.parse(
        JSON.stringify({ ...dashboard, messageThreads }, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
        ),
    );
    return <SeekerDashboard initialData={initialData} />;
}
