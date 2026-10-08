import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AuthPanel } from "@/components/auth-panel";
import { safeAuthNext } from "@/lib/auth-config";
export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({ next: safeAuthNext(search["next"]) }),
  head: () => ({
    meta: [
      { title: "Sign in — TacPredict" },
      {
        name: "description",
        content:
          "Sign in securely to TacPredict. Your account and self-custodial wallet stay separate.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  return (
    <section className="mx-auto max-w-[400px] py-4 sm:py-8">
      <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" />
        Back home
      </Link>
      <div className="overflow-hidden rounded-[32px] border border-white/15">
        <AuthPanel next={next} />
      </div>
    </section>
  );
}
