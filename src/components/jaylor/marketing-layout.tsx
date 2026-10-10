import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SupportLink } from "./support-link";
import { BrandLogo } from "./logo";
import { COMPANY_LINE, SHOW_DIRECTORY_IN_NAV } from "@/lib/jaylor";

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <main className="premium-public min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 lg:px-10">
          <Link to="/" aria-label="Jaylor home">
            <BrandLogo dark showTagline markClassName="h-14 w-auto" />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
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
              to="/passport"
              className="hidden text-muted-foreground hover:text-foreground sm:inline"
            >
              Passport
            </Link>
            {SHOW_DIRECTORY_IN_NAV && (
              <Link
                to="/tailors"
                className="hidden text-muted-foreground hover:text-foreground sm:inline"
              >
                Find a tailor
              </Link>
            )}
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
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-5 lg:px-10">
          <div className="grid w-full gap-8 text-center sm:grid-cols-3 sm:text-left">
            <div>
              <p className="text-xs uppercase text-muted-foreground">For clients</p>
              <nav className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/passport" className="hover:text-foreground">
                  Measurement Passport
                </Link>
                <Link to="/tailors" className="hover:text-foreground">
                  Find a tailor
                </Link>
              </nav>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">For tailors</p>
              <nav className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/features" className="hover:text-foreground">
                  Features
                </Link>
                <Link to="/pricing" className="hover:text-foreground">
                  Pricing
                </Link>
                <Link to="/auth" search={{ mode: "signup" }} className="hover:text-foreground">
                  Start free
                </Link>
              </nav>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Company</p>
              <nav className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/about" className="hover:text-foreground">
                  About
                </Link>
                <Link to="/contact" className="hover:text-foreground">
                  Contact
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
            </div>
          </div>
          <SupportLink className="h-12 max-w-full rounded-none px-4" />
          <div className="flex flex-col items-center gap-4 text-center">
            <BrandLogo dark showTagline markClassName="h-11 w-auto" />
            <p className="text-sm text-muted-foreground">{COMPANY_LINE}</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
