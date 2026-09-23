import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "./logo";
import { COMPANY_LINE } from "@/lib/jaylor";

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <main className="premium-public min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 lg:px-10">
          <Link to="/" aria-label="Jaylor home">
            <BrandLogo dark showTagline markClassName="h-20 w-auto" />
          </Link>
          <nav className="flex items-center gap-6 text-xs uppercase text-muted-foreground">
            <Link
              to="/features"
              className="hidden text-muted-foreground hover:text-foreground sm:inline"
            >
              Features
            </Link>
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
            <Link to="/auth" className="border-b border-gold pb-1 text-foreground hover:text-gold">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-border py-14">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-4 px-5 text-center lg:px-10">
          <BrandLogo dark showTagline markClassName="h-20 w-auto" />
          <nav className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <Link to="/features" className="hover:text-foreground">
              Features
            </Link>
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
