import { orderStatusLabel } from "@/lib/jaylor";
import { useAppT } from "@/lib/i18n/i18n-context";

/** Order status is stored in English in the database and never changes --
 *  only how it's displayed is translated. Falls back to the plain English
 *  capitalize (orderStatusLabel) while the app_common namespace is still
 *  loading, or for any status the translation table doesn't cover. */
export function useOrderStatusLabel(): (status: string) => string {
  const t = useAppT("app_common");
  return (status: string) => t(`status_${status}`) || orderStatusLabel(status);
}

function defaultRoleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Store member role (owner/manager/tailor) -- same DB-stores-English,
 *  display-only translation as order status. */
export function useRoleLabel(): (role: string) => string {
  const t = useAppT("app_common");
  return (role: string) => t(`role_${role}`) || defaultRoleLabel(role);
}
