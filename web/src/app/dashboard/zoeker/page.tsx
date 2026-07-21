import { SeekerDashboard } from "@/components/seeker/seeker-dashboard";
import { requireEmailVerifiedUser } from "@/features/auth/guards";
import { getSeekerDashboard } from "@/features/seeker/seeker-service";

export default async function SeekerDashboardPage() {
    const session = await requireEmailVerifiedUser();
    const dashboard = await getSeekerDashboard(session.user.id);
    const initialData = JSON.parse(
        JSON.stringify(dashboard, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
        ),
    );
    return <SeekerDashboard initialData={initialData} />;
}
