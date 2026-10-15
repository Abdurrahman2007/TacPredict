import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/components/admin/views/dashboard";

export const Route = createFileRoute("/admin/")({ component: DashboardView });
