import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogoMark } from "./logo";
import { StitchDivider } from "./stitch-divider";
import { COMPANY_LINE } from "@/lib/jaylor";

export function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <main className="linen min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark className="size-8" />
            <span className="font-heading text-lg">Jaylor</span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/privacy-policy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/security" className="hover:text-foreground">
              Security
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-8">
        <h1 className="font-heading text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        <StitchDivider className="my-6" />

        <div className="prose-legal space-y-6 text-sm leading-relaxed text-foreground [&_h2]:mt-8 [&_h2]:font-heading [&_h2]:text-xl [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-muted-foreground">
          {children}
        </div>

        <p className="mt-12 text-center text-xs text-muted-foreground">{COMPANY_LINE}</p>
      </div>
    </main>
  );
}
