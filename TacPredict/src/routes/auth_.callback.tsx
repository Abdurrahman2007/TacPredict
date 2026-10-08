import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeAuthNext } from "@/lib/auth-config";

export const Route = createFileRoute("/auth_/callback")({
  head: () => ({
    meta: [{ title: "Completing sign-in — TacPredict" }, { name: "robots", content: "noindex" }],
  }),
  component: Callback,
});
function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const exchange = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    let active = true;
    if (!exchange.current)
      exchange.current = (async () => {
        const url = new URL(window.location.href);
        if (url.searchParams.has("error"))
          throw new Error("Sign-in was cancelled or could not complete. Please try again.");
        const code = url.searchParams.get("code");
        if (!code)
          throw new Error("This sign-in link is missing its code. Please start sign-in again.");
        const result = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState({}, "", "/auth/callback");
        if (result.error || !result.data.session)
          throw new Error("This sign-in link is invalid or expired. Please start sign-in again.");
      })();
    void exchange.current
      .then(async () => {
        if (!active) return;
        const next = safeAuthNext(sessionStorage.getItem("tac-auth-next"));
        sessionStorage.removeItem("tac-auth-next");
        await navigate({ to: next, replace: true });
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : "Sign-in failed. Please try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [navigate]);
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-7 text-center">
      <h1 className="text-xl font-semibold">
        {error ? "Sign-in needs another try" : "Completing your sign-in…"}
      </h1>
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        {error || "Verifying your secure login."}
      </p>
      {error && (
        <Link to="/auth" search={{ next: "/" }} className="mt-5 inline-block text-primary">
          Back to sign in
        </Link>
      )}
    </div>
  );
}
