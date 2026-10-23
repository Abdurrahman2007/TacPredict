import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/components/account-pages";
export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Your Profile — TacPredict" }] }),
  component: AccountPage,
});
