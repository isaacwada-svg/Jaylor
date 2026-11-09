import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout only -- the actual quotations list lives in quotations.index.tsx.
 *  Needed so /quotations/$quoteId actually renders: without this file
 *  acting as a pure Outlet layout, TanStack Router still matches the child
 *  route and updates the URL, but nothing ever mounts it, because
 *  quotations.index.tsx (formerly this file) had its own full-page
 *  component with no <Outlet />. */
export const Route = createFileRoute("/_authenticated/quotations")({
  staticData: { sitemap: false },
  component: () => <Outlet />,
});
