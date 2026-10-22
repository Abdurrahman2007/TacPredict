import { createFileRoute, redirect } from "@tanstack/react-router";
// Retire the old search page without breaking saved links.
export const Route = createFileRoute("/search")({
  beforeLoad: () => {
    throw redirect({ to: "/ranking" });
  },
});
