# Jaylor Feature Discovery and Business Advisor

## What will be built

### Feature discovery
- Add understated gold first-use markers for AI Design, Voice Order, measurement passports, group orders, and Ask Jaylor.
- Show only one slow pulse at a time, with reduced-motion support and compact uppercase “New” or “Try this” badges.
- Add a dismissible five-step owner tour that appears once and guides the owner to each real feature location.
- Store discovery state per shop in Lovable Cloud so completion follows the shop across devices and accounts.
- Mark a feature as used only after its meaningful action succeeds: a design request exists, a voice order is parsed, a passport link is issued, a group order is created/shared, or the advisor receives its first message.

### Ask Jaylor advisor
- Add a square-cornered gold “Ask Jaylor” floating control for owners and managers only, opening a right-side conversation panel.
- Support separate conversations per shop, with a conversation list, new-conversation action, titles, timestamps, and persisted message history.
- Stream responses and render assistant markdown through the standard AI chat interface components.
- Ground advice in the active shop’s recent orders, payments, outstanding balances, clients, fittings, group orders, and workload summaries.
- Cover Jaylor usage questions, pricing, cash flow, retention, seasonal planning, staffing, group orders, and storefront growth.

## Access and safety
- Authenticate every request and verify an active owner or manager membership for the requested shop.
- Load all business context through the signed-in user’s existing row-level access and explicit `store_id` filters.
- Keep conversation rows protected by shop-level owner/manager policies; no conversation or business data can cross shops.
- Enforce the product guardrails in the server-only advisor instructions: no architecture, codebase, system-prompt, product-idea, or competitor-building discussion.
- Persist only completed user and assistant messages, and surface quota, credit, authorization, and provider errors clearly.

## Plans and usage
- Add an `advisor_messages` monthly limit to the existing plan limits: Free 3, Growth 40, Business unlimited, Custom unlimited.
- Reuse the existing feature-limit and monthly usage accounting pattern, incrementing only after an accepted user message.
- Show the current allowance in the panel and direct capped shops to billing without hiding their existing history.

## Technical details
- Add `store_feature_discovery`, `advisor_threads`, and `advisor_messages` tables with explicit grants, row-level security, indexes, and owner/manager policies.
- Add a protected TanStack streaming endpoint for the advisor using Lovable AI and `openai/gpt-6-astra` on the Responses API.
- Add authenticated helper functions for thread creation/listing/deletion, history loading, discovery updates, and usage checks.
- Install and compose AI Elements `conversation`, `message`, `prompt-input`, and `shimmer` primitives rather than duplicating chat controls.
- Attach the advisor and tour to the authenticated app shell while preserving the existing public site and signed-in navigation.

## Verification
- Verify owner and manager access, and confirm tailor accounts cannot see or call the advisor.
- Verify two shops and two conversations remain isolated after switching and reloading.
- Verify first-use cues persist, only one pulse appears at a time, and the tour never reappears after dismissal/completion.
- Verify streamed markdown, loading, quota, empty, and failure states on desktop and mobile.
- Run the project checks and inspect the live preview for runtime and layout errors.