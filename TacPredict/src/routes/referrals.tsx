import { createFileRoute } from "@tanstack/react-router";
import { ReferralsPage } from "@/components/account-pages";
export const Route = createFileRoute("/referrals")({
  head: () => ({ meta: [{ title: "Invite friends — TacPredict" }] }),
  component: ReferralsPage,
});
