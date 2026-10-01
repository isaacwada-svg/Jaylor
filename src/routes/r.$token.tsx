import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrandLogo } from "@/components/jaylor/logo";
import { OfflineNotice } from "@/components/jaylor/offline-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BusinessReportDocument,
  type HealthReport,
} from "@/components/jaylor/business-report-document";
import { COMPANY_LINE } from "@/lib/jaylor";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "@/lib/use-online-status";

export const Route = createFileRoute("/r/$token")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({ meta: [{ title: "Business report: Jaylor" }] }),
  component: PublicReportRoute,
});

type ShareResult =
  { status: "not_found" | "revoked" | "expired" } | { status: "available"; report: HealthReport };

// get_report_share isn't in the generated Database types yet. Must stay a
// call on `supabase` itself, not a bare extracted reference --
// supabase.rpc() reads `this.rest` internally, so aliasing it directly
// loses that binding and throws "Cannot read properties of undefined
// (reading 'rest')".
function rpcGetReportShare(
  token: string,
  userAgent: string,
): Promise<{
  data: unknown;
  error: unknown;
}> {
  return supabase.rpc(
    "get_report_share" as never,
    {
      p_token: token,
      p_user_agent: userAgent,
    } as never,
  ) as unknown as Promise<{ data: unknown; error: unknown }>;
}

function PublicReportRoute() {
  const { token } = Route.useParams();
  const online = useOnlineStatus();

  const { data, isLoading } = useQuery({
    queryKey: ["public-report-share", token],
    enabled: online,
    queryFn: async () => {
      const { data, error } = await rpcGetReportShare(token, navigator.userAgent);
      if (error) throw error;
      return data as unknown as ShareResult;
    },
  });

  if (!online) {
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <BrandLogo markClassName="h-10 w-auto" />
        <OfflineNotice label="This report needs an internet connection to load." />
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="linen flex min-h-screen items-center justify-center bg-background px-4">
        <Skeleton className="h-64 w-full max-w-md rounded-2xl" />
      </main>
    );
  }

  if (!data || data.status !== "available") {
    const messages: Record<
      "not_found" | "revoked" | "expired",
      { title: string; description: string }
    > = {
      not_found: {
        title: "Link not found",
        description: "This report link doesn't exist, or was never created.",
      },
      revoked: {
        title: "Link revoked",
        description: "The shop has revoked access to this report.",
      },
      expired: {
        title: "Link expired",
        description: "This report link is no longer valid. Ask the shop for a new one.",
      },
    };
    const message = messages[data?.status ?? "not_found"];
    return (
      <main className="linen flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4 text-center">
        <BrandLogo markClassName="h-10 w-auto" />
        <h1 className="mt-4 text-xl">{message.title}</h1>
        <p className="text-sm text-muted-foreground">{message.description}</p>
      </main>
    );
  }

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex justify-center print:hidden">
          <BrandLogo markClassName="h-10 w-auto" />
        </div>

        <div className="mt-6">
          <BusinessReportDocument report={data.report} id="jaylor-public-business-report" />
        </div>

        <div className="mx-auto mt-4 flex max-w-4xl justify-center print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            Download PDF
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground print:hidden">
          {COMPANY_LINE}
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #jaylor-public-business-report, #jaylor-public-business-report * { visibility: visible; }
          #jaylor-public-business-report { position: fixed; inset: 0 auto auto 0; width: 100%; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </main>
  );
}
