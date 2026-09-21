# Jaylor Premium Editorial Redesign

## Goal
Transform Jaylor’s public experience into a mature, high-fashion business brand using the selected **Editorial Obsidian Luxury** direction, while preserving the product’s real features, pricing, calculator, sign-in flow, and truthful claims.

## What will change
- Rebuild the homepage around a cinematic editorial composition with Jaylor as the first visual signal.
- Use the locked Midnight Atelier palette: deep ink `#141126`, warm ivory `#F7F3EC`, antique gold `#B89452`, and restrained burgundy `#6D2443`.
- Replace the current typography with **Instrument Serif** for display text and **Work Sans** for interface and body copy.
- Introduce premium tailoring photography showing Nigerian atelier work, garments, measurements, and client service.
- Restyle the working notebook-cost calculator as the central product-proof experience rather than a generic floating card.
- Convert repeated feature cards into an editorial grid with fine rules, stronger hierarchy, and more deliberate spacing.
- Redesign product previews, pricing, FAQ, final sign-up area, navigation, and footer to match the selected visual language.
- Remove the existing unverified named testimonials; customer stories and usage counts will remain absent until genuine evidence is available.
- Carry the same typography, palette, navigation, and footer treatment into shared public marketing pages without changing their legal or business content.

## Interaction and quality
- Use restrained reveal and image movement, refined button transitions, and reduced-motion support.
- Keep all calls to action, calculator controls, links, sign-in state, analytics, and mobile behavior functional.
- Ensure the first viewport shows the brand, offer, primary action, tailoring imagery, and a visible hint of the next section.
- Check desktop and mobile layouts for legibility, image framing, overlap, loading behavior, and interaction errors.

## Technical details
- Add semantic premium tokens to the existing Tailwind v4 design system and scope the dark editorial treatment to public marketing surfaces.
- Load Instrument Serif and Work Sans through the document head.
- Use generated local image assets rather than external hotlinks.
- Preserve route metadata and existing SEO structure; update homepage metadata only if visible positioning copy changes.
- Do not change backend logic, subscriptions, security rules, or authenticated workflows.
