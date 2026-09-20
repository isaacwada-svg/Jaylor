import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { LogoMark } from "@/components/jaylor/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANY_LINE } from "@/lib/jaylor";
import { whatsappLink } from "@/lib/whatsapp";
import { getSharedDesign } from "@/lib/design-photos.functions";

export const Route = createFileRoute("/design/$token")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Your style preview — Jaylor" }] }),
  component: SharedDesign,
});

function SharedDesign() {
  const { token } = Route.useParams();

  const { data: design, isLoading } = useQuery({
    queryKey: ["design-by-token", token],
    queryFn: () => getSharedDesign({ data: { token } }),
  });

  return (
    <main className="linen flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2">
          <LogoMark className="size-9" />
          <span className="font-heading text-2xl">Jaylor</span>
        </Link>

        <div className="mt-8 space-y-4">
          {isLoading ? (
            <Skeleton className="h-80 rounded-2xl" />
          ) : !design ? (
            <div className="rounded-2xl border bg-card p-6 text-center">
              <h1 className="text-xl">We couldn&apos;t find that design</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The link may be wrong or the preview was removed.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <img src={design.image_url} alt="Style preview" className="mx-auto rounded-2xl" />
              <p className="font-medium">
                {design.client_name}&apos;s style, from {design.store_name}
              </p>
              <p className="text-sm text-muted-foreground">{design.description}</p>
              <Button asChild className="w-full">
                <a
                  href={whatsappLink(
                    "",
                    `Hi, here's my saved style preview from ${design.store_name}: "${design.description}"`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" />
                  Share this preview
                </a>
              </Button>
            </div>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
