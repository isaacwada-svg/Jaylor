/** Shared section heading -- an eyebrow label over a title, matching the
 *  pattern already used on public marketing pages, so a page's related
 *  stat/content groups read as clearly labeled zones instead of an
 *  undifferentiated stack of cards. Used on the admin Overview tab and the
 *  store owner's dashboard. */
export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-gold">{eyebrow}</p>
      <h2 className="mt-1 text-xl">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
