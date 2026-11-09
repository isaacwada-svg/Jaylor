import { createFileRoute, Outlet } from "@tanstack/react-router";
import { APP_FONTS_HREF, AppThemeScope } from "@/components/jaylor/app-theme-scope";

/** Layout only -- the actual /admin overview lives in admin.index.tsx.
 *  Needed so /admin/stores/$storeId actually renders: without this file
 *  acting as a pure Outlet layout, TanStack Router still matches the child
 *  route and updates the URL, but nothing ever mounts it, because
 *  admin.index.tsx (formerly this file) had its own full-page component
 *  with no <Outlet />. */
export const Route = createFileRoute("/admin")({
  staticData: { sitemap: false },
  // Same navy-and-gold app theme as the store owner's app (PR U).
  head: () => ({ links: [{ rel: "stylesheet", href: APP_FONTS_HREF }] }),
  component: () => (
    <AppThemeScope>
      <Outlet />
    </AppThemeScope>
  ),
});
