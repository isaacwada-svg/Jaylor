<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Public sample walkthroughs are isolated client-only state with no business-data writes or live tracking links, so visitors can explore without affecting real shops.
- Reuse the shared support link, support contact and social profiles from the shared constants across public pages so contact details remain consistent.
- Scope homepage button finishes through the jaylor-home theme and shared Button data attributes so other pages retain their existing styling.

- Keep `.env` tracked in git (never list it in .gitignore): published builds read the public backend URL and publishable key from it, and the live site crashes without them.
- AI-generated media keeps a short visible AI mark (e.g. "AI clip"): captions lead with product or trust copy rather than repeating an AI disclaimer, so visitors read the product as real while the AI origin stays disclosed.
