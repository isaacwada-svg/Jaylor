import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout only -- the actual /admin overview lives in admin.index.tsx.
 *  Needed so /admin/stores/$storeId actually renders: without this file
 *  acting as a pure Outlet layout, TanStack Router still matches the child
 *  route and updates the URL, but nothing ever mounts it, because
 *  admin.index.tsx (formerly this file) had its own full-page component
 *  with no <Outlet />. */
export const Route = createFileRoute("/admin")({
  staticData: { sitemap: false },
  component: () => <Outlet />,
});
