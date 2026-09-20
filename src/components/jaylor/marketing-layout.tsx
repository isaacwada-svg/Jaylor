import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogoMark } from "./logo";
import { COMPANY_LINE } from "@/lib/jaylor";

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <main className="linen min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark className="size-8" />
            <span className="font-heading text-xl">Jaylor</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to="/pricing"
              className="hidden text-muted-foreground hover:text-foreground sm:inline"
            >
              Pricing
            </Link>
            <Link
              to="/about"
              className="hidden text-muted-foreground hover:text-foreground sm:inline"
            >
              About
            </Link>
            <Link to="/auth" className="text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 text-center lg:px-8">
          <div className="flex items-center gap-2">
            <LogoMark className="size-7" />
            <span className="font-heading text-lg">Jaylor</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link to="/about" className="hover:text-foreground">
              About
            </Link>
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
          <p className="text-xs text-muted-foreground">{COMPANY_LINE}</p>
        </div>
      </footer>
    </main>
  );
}
