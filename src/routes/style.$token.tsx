import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/jaylor/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_LINE } from "@/lib/jaylor";
import { useStorefrontPhotoUrls } from "@/lib/storefront-photos";

// get_style_book isn't in the generated Database types yet, same drift as
// every other freshly-migrated RPC.
const rpc = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export const Route = createFileRoute("/style/$token")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Style Book — Jaylor" },
      { name: "description", content: "Every garment made for you, in one place." },
    ],
  }),
  component: StyleBookPage,
});

type Garment = { garment_type: string; created_at: string; collected_at: string | null };

type StyleBook = {
  client_first_name: string;
  store_name: string;
  store_logo_url: string | null;
  garments: Garment[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StyleBookPage() {
  const { token } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["style-book", token],
    queryFn: async () => {
      const { data, error } = await rpc("get_style_book", { p_token: token });
      if (error) throw error;
      return data as unknown as StyleBook;
    },
    retry: false,
  });

  const photoUrl = useStorefrontPhotoUrls([data?.store_logo_url ?? null]);
  const resolvedLogo = data?.store_logo_url ? photoUrl(data.store_logo_url) : undefined;

  async function handleShare() {
    const url = window.location.href;
    const nav = navigator as Navigator & { share?: (data: { url: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ url });
        return;
      } catch {
        // user cancelled -- fall through to copy
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  return (
    <main className="linen min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/" className="flex items-center justify-center" aria-label="Jaylor home">
          <BrandLogo markClassName="h-12 w-auto" />
        </Link>

        <div className="mt-8">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </div>
          ) : error || !data ? (
            <div className="rounded-2xl border bg-card p-6 text-center">
              <h1 className="text-xl">We couldn&apos;t find this Style Book</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The link may be turned off or out of date.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {resolvedLogo && (
                    <img src={resolvedLogo} alt="" className="size-12 rounded-2xl object-cover" />
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      Style Book
                    </p>
                    <h1 className="text-xl">
                      {data.client_first_name}&apos;s garments at {data.store_name}
                    </h1>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void handleShare()}>
                  <Share2 className="size-4" />
                  Share
                </Button>
              </div>

              <div className="mt-6 space-y-3">
                {data.garments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No garments recorded yet.</p>
                ) : (
                  data.garments.map((g, i) => (
                    <div key={i} className="rounded-2xl border bg-card p-4">
                      <p className="font-medium">{g.garment_type}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {g.collected_at
                          ? `Collected ${formatDate(g.collected_at)}`
                          : `Ordered ${formatDate(g.created_at)}`}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
