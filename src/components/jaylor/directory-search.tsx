import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { DirectoryListingCard } from "@/components/jaylor/directory-listing-card";
import { EmptyState } from "@/components/jaylor/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDirectoryListings } from "@/lib/directory.functions";
import type { DirectoryLocation, DirectoryPage } from "@/lib/directory";
import { Link } from "@tanstack/react-router";

const ALL = "__all__";

export function DirectoryResults({
  initialData,
  locations,
  specialties,
  fixedState,
  fixedCity,
  emptyLabel,
}: {
  initialData: DirectoryPage;
  locations: DirectoryLocation[];
  specialties: string[];
  /** Locked for a /tailors/$citySlug page -- no state/city dropdown shown. */
  fixedState?: string | null;
  fixedCity?: string | null;
  emptyLabel: string;
}) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<string>(fixedState ?? ALL);
  const [city, setCity] = useState<string>(fixedCity ?? ALL);
  const [specialty, setSpecialty] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  const states = [...new Set(locations.map((l) => l.state).filter((s): s is string => !!s))].sort();
  const cities = [
    ...new Set(
      locations
        .filter((l) => state === ALL || l.state === state)
        .map((l) => l.city)
        .filter((c): c is string => !!c),
    ),
  ].sort();

  const filters = {
    search: search.trim() || undefined,
    state: state === ALL ? undefined : state,
    city: city === ALL ? undefined : city,
    specialty: specialty === ALL ? undefined : specialty,
    page,
  };

  const isDefaultQuery =
    !filters.search && !filters.state && !filters.city && !filters.specialty && page === 1;

  const { data } = useQuery({
    queryKey: ["directory-listings", filters],
    queryFn: () => getDirectoryListings({ data: filters }),
    initialData: isDefaultQuery ? initialData : undefined,
  });

  const view = data ?? initialData;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search shop name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search shop name"
            className="pl-9"
          />
        </div>
        {!fixedState && (
          <Select
            value={state}
            onValueChange={(v) => {
              setState(v);
              setCity(ALL);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All states</SelectItem>
              {states.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!fixedCity && (
          <Select
            value={city}
            onValueChange={(v) => {
              setCity(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All cities</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={specialty}
          onValueChange={(v) => {
            setSpecialty(v);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Specialty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All specialties</SelectItem>
            {specialties.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {view.results.length === 0 ? (
        <EmptyState
          className="mt-8"
          title={search || state !== ALL || city !== ALL || specialty !== ALL ? "No tailors match this search" : "Shop listings will appear here"}
          description={search || state !== ALL || city !== ALL || specialty !== ALL ? emptyLabel : "There are no public shop listings yet. Jaylor’s order, payment and measurement tools are available independently of the directory."}
          action={
            <Button asChild>
              <Link to="/auth" search={{ mode: "signup" }}>
                Create your shop
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {view.results.map((listing) => (
              <div key={listing.store_id}>
                <DirectoryListingCard listing={listing} />
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                      "@context": "https://schema.org",
                      "@type": "LocalBusiness",
                      name: listing.name,
                      image: listing.logo_url ?? undefined,
                      address: listing.city
                        ? {
                            "@type": "PostalAddress",
                            addressLocality: listing.city,
                            addressCountry: "NG",
                          }
                        : undefined,
                      description: listing.bio ?? undefined,
                      url: `https://jaylor.com.ng/${listing.slug}`,
                    }),
                  }}
                />
              </div>
            ))}
          </div>

          {view.total_pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={view.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {view.page} of {view.total_pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={view.page >= view.total_pages}
                onClick={() => setPage((p) => Math.min(view.total_pages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Shops are ordered by plan, on-time delivery and recent activity.
          </p>
        </>
      )}
    </div>
  );
}
