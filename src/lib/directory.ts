/** Shared types and helpers for the public tailor directory (/tailors). */

export type DirectoryBadge = { rate: number; orders_counted: number };

export type DirectoryListing = {
  store_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  whatsapp_phone: string | null;
  area: string | null;
  city: string | null;
  bio: string | null;
  specialties: string[];
  remote_orders: boolean;
  badge: DirectoryBadge | null;
};

export type DirectoryPage = {
  results: DirectoryListing[];
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
};

export type DirectoryLocation = { state: string | null; city: string | null };

export const DIRECTORY_MAX_SPECIALTIES = 8;
export const DIRECTORY_BIO_MAX_LENGTH = 200;

/** Matches the slug scheme used for /tailors/$citySlug city pages. */
export function slugifyLocation(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolves a /tailors/$citySlug param back to a real city or state value,
 *  from the locations get_directory_locations() returns. City is preferred
 *  since it's what the example in the spec ("abuja") names. */
export function resolveLocationSlug(
  slug: string,
  locations: DirectoryLocation[],
): { state: string | null; city: string | null; label: string } | null {
  for (const loc of locations) {
    if (loc.city && slugifyLocation(loc.city) === slug) {
      return { state: null, city: loc.city, label: loc.city };
    }
  }
  for (const loc of locations) {
    if (loc.state && slugifyLocation(loc.state) === slug) {
      return { state: loc.state, city: null, label: loc.state };
    }
  }
  return null;
}
