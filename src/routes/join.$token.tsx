import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LogoMark } from "@/components/jaylor/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/utils";
import { COMPANY_LINE, PENDING_INVITE_KEY } from "@/lib/jaylor";

export const Route = createFileRoute("/join/$token")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [{ title: "Join your team — Jaylor" }],
  }),
  component: JoinInvite,
});

type Invite = { store_name: string; role: string; status: string; expires_at: string };

function JoinInvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [accepting, setAccepting] = useState(false);

  const { data: invite, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_invite_by_token", { p_token: token });
      if (error) throw error;
      return data as unknown as Invite | null;
    },
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  function goToAuth() {
    try {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
    } catch {
      // ignore storage failures
    }
    navigate({ to: "/auth" });
  }

  async function accept() {
    setAccepting(true);
    try {
      const { error } = await supabase.rpc("accept_invite", { p_token: token });
      if (error) throw error;
      try {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
      } catch {
        // ignore
      }
      toast.success("You've joined the team");
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not accept this invite"));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="linen flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2">
          <LogoMark className="size-9" />
          <span className="font-heading text-2xl">Jaylor</span>
        </Link>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm text-center">
          {isLoading || userEmail === undefined ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3 mx-auto" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !invite ? (
            <>
              <h1 className="text-xl">We couldn&apos;t find that invite</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask the store owner to send you a new link.
              </p>
            </>
          ) : invite.status === "accepted" ? (
            <>
              <h1 className="text-xl">This invite has already been used</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                If this wasn&apos;t you, ask the store owner for a new link.
              </p>
            </>
          ) : invite.status === "expired" || new Date(invite.expires_at) < new Date() ? (
            <>
              <h1 className="text-xl">This invite has expired</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask the store owner to send you a new link.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl">Join {invite.store_name} on Jaylor</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You&apos;ve been invited as a {invite.role}.
              </p>
              {userEmail !== null ? (
                <Button className="mt-6 w-full" onClick={accept} disabled={accepting}>
                  {accepting ? "Joining..." : "Accept and join"}
                </Button>
              ) : (
                <div className="mt-6 space-y-2">
                  <Button className="w-full" onClick={goToAuth}>
                    Sign in or create an account
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Come back to this link after signing in to finish joining.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
