import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout only -- the actual /tailors directory page lives in
 *  tailors.index.tsx. Needed so /tailors/$citySlug actually renders:
 *  without this file acting as a pure Outlet layout, TanStack Router still
 *  matches the child route and updates the URL, but nothing ever mounts
 *  it, because tailors.index.tsx (formerly this file) had its own
 *  full-page component with no <Outlet />. */
export const Route = createFileRoute("/tailors")({
  staticData: { sitemap: false },
  component: () => <Outlet />,
});
