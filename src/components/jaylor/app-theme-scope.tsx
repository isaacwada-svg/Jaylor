import { useLayoutEffect, type ReactNode } from "react";

/** Montserrat 700/800 and Playfair Display 700, which the public pages
 *  don't load. Requested only by logged-in screens (store app and admin). */
export const APP_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Playfair+Display:wght@700&display=swap";

/** Puts .jaylor-app on <html> while mounted, so the app's navy-and-gold
 *  tokens (styles.css) also reach dialogs, sheets and toasts portalled to
 *  <body>. Public and client pages never get it. */
export function AppThemeScope({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.add("jaylor-app");
    return () => document.documentElement.classList.remove("jaylor-app");
  }, []);
  return <>{children}</>;
}
