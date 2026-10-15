import { createFileRoute, notFound } from "@tanstack/react-router";
import { AdminSectionView } from "@/components/admin/admin-section-view";
import { defaultViews, isAdminRouteSection } from "@/lib/protocol/admin-nav";

export const Route = createFileRoute("/admin/$section")({
  validateSearch: (search: Record<string, unknown>): { view?: string } => {
    const view = search["view"];
    return typeof view === "string" && /^[a-z-]{1,24}$/.test(view) ? { view } : {};
  },
  beforeLoad: ({ params }) => {
    if (!isAdminRouteSection(params.section)) throw notFound();
  },
  component: AdminSectionPage,
});

function AdminSectionPage() {
  const { section } = Route.useParams();
  const { view } = Route.useSearch();
  if (!isAdminRouteSection(section)) return null;
  return <AdminSectionView section={section} view={view ?? defaultViews[section]} />;
}
