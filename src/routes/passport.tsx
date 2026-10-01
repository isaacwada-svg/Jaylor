import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout only -- the actual /passport page lives in passport.index.tsx.
 *  Needed so /passport/claim, /passport/me etc. actually render: without
 *  this file acting as a pure Outlet layout, TanStack Router still matches
 *  the child route and updates the URL, but nothing ever mounts it, because
 *  passport.index.tsx (formerly this file) had its own full-page component
 *  with no <Outlet />. */
export const Route = createFileRoute("/passport")({
  staticData: { sitemap: false },
  component: () => <Outlet />,
});
