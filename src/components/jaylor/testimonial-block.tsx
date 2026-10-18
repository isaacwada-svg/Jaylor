import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type Testimonial = {
  quote: string;
  name: string;
  shopName: string;
  city: string;
  photoUrl?: string;
};

/**
 * Renders a single real testimonial. Callers gate this behind
 * SHOW_TESTIMONIALS (see src/lib/jaylor.ts) until real content exists --
 * this component never ships with placeholder or invented quotes.
 */
export function TestimonialBlock({ quote, name, shopName, city, photoUrl }: Testimonial) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <section aria-label="What tailors say" className="py-12 lg:py-16">
      <div className="mx-auto w-full max-w-2xl px-5 text-center sm:px-8 lg:px-10">
        <div className="border border-gold/40 bg-secondary/40 px-6 py-10 sm:px-10">
          <p className="mx-auto max-w-md text-lg leading-8 text-foreground/90">"{quote}"</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Avatar className="size-11">
              {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">
                {shopName}, {city}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
