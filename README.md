# Backfill

A business-facing, call-first procurement workspace. Owners speak procurement requests, compare supplier quotes against constraints, inspect conversations, and approve a supplier.

## Run

```sh
bun install
bun run dev
```

`bun run build` runs TypeScript checks and produces the frontend in `dist/`.

## Current scope

React 19 + TypeScript + Vite, with Lucide icons and custom responsive styling. This is the UI-first foundation; TanStack Start/server functions can be introduced with backend work.

- Recovery overview and detail workspace
- New recovery form with required fields and numeric validation
- Quote comparison with a deterministic UI constraint validator
- Supplier directory and sample call transcripts
- Per-request pre-authorisation within budget or approval by call/text
- Browser speech input with typed fallback (browser support varies)
- Explicit human approval state
- Responsive desktop/mobile layout
- Business-specific supplier discovery profiles with hard eligibility gates
- Negotiation, contact-time, retry and anonymous market-quote rules
- One structured extraction schema for calls, voice notes, email, SMS and forms

With blank Supabase settings, records and metrics are illustrative and demo state resets on refresh. With Supabase configured, owner sign-in gates the workspace and requests/supplier imports persist to Postgres. Supplier outbound calls, SMS, email, purchasing and recordings remain unconnected. The offer deadline flag is sample data, not a production timestamp validator. Additional requests deliberately show an empty quote state instead of fabricated offers.

## Procurement decision design

The intended flow is: speak item/deadline/budget → retrieve semantically relevant suppliers → enforce authorised-list, current ABN, certification and opt-out gates → rank eligible suppliers with the selected business profile → call and normalise quotes → enforce negotiation bounds → purchase within explicit pre-authorisation or call/text the owner for confirmation. Voice is the primary supplier contact channel; SMS/email are follow-ups. The application is owner-facing; a customer/supplier chatbot is outside this first slice.

Embeddings are intended only for product/category recall when supplier catalogues use different wording. A small extraction model turns scraped pages and communications into typed facts with confidence and evidence. Deterministic code owns eligibility, weighted ranking, exact money arithmetic, maximum spend, deposits, payment-term bounds, contact rules, purchase authority and escalation. Low-confidence facts require review and model output never grants permission.

The starter discovery profiles are hospitality/perishables, construction/urgent materials, and general wholesale. Each uses explicit weights for product match, delivery fit, landed cost, reliability, locality, payment terms and certifications. Product mismatch, inactive or stale ABN evidence, missing authorisation, missing required certification, and supplier opt-out remain hard blockers regardless of score.

## Structure

- `src/App.tsx`: owner workspace and navigation
- `src/components/NewRecovery.tsx`: recovery request dialog
- `src/features/recoveries/data.ts`: typed fixtures and constraint checks
- `src/styles.css`: theme and responsive layouts

Do not commit credentials. `.gitignore` excludes environment files, dependencies, build output, and local tool artifacts while allowing `.env.example`.

## Voice orb

Voice intake uses [Orb UI](https://orb-ui.com/) with `theme="cloud"`. Browser speech recognition drives the unconfigured demo. To enable a public ElevenLabs agent, copy `.env.example` to `.env.local`, set `VITE_ELEVENLABS_AGENT_ID`, and restart Vite. The official Orb UI ElevenLabs adapter owns session start/stop and supplies listening/speaking states and volume. User speech is captured in the request text. Agent sessions have not been live-tested without a configured agent.

Private agents require a server endpoint for signed URLs or conversation tokens. Never expose API keys through Vite environment variables. Closing the dialog stops its session. Purchasing remains unconnected. Structured procurement parsing is implemented as a Supabase Edge Function and needs provider secrets before deployment.

## Supplier assessment and payment terms

Quote rankings show requirement failures, price headroom, demo on-time history, and payment terms. Requests capture minimum days from invoice and maximum deposit. Counteroffers show original versus offered terms and fees; out-of-policy terms require confirmation. The purchase eligibility function also requires explicit pre-authorisation, supplier authorisation, and ABN verification. All fixture ABNs are unverified, preventing live eligibility. Ranking does not authorise a purchase. Run `bun test` for the ranking and authorisation checks.

## Supplier imports and negotiation tools

Supplier imports validate the official [ABR modulus-89 checksum](https://abr.business.gov.au/Help/AbnFormat), phone format, and duplicate ABNs. A passing checksum is not registry evidence. Imported suppliers are review records (persisted when Supabase is configured); they cannot enter the calling list. Live verification needs an ABR web-service GUID and a server integration to retrieve active status, entity/business names, GST status and location. Name/contact checks and owner authorisation follow registry verification. The freshness gate defaults to 24 hours.

The Call activity page includes a negotiation desk. Quote arithmetic uses integer cents and quantities to three decimal places, rounds half-up at each displayed stage, and includes explicit discount, delivery, fees, additional tax, deposit and budget. Tax is a user-supplied assumption rather than an inferred GST treatment. No order is placed.

Conversation cues are transparent regex-based transcript checks, not acoustic sentiment analysis or personality inference. They advise shorter responses under explicit time pressure, stop bargaining at final-offer boundaries or after two counteroffers, and prioritise contact opt-outs. Silence, accent and speaking speed are not treated as impatience. UI suggestions are not sent automatically.

The optional ElevenLabs session registers `calculate_quote` and `assess_supplier_reply` client handlers. Matching tools must be configured in the ElevenLabs agent before it can invoke them. `calculate_quote` accepts the eight string fields in `QuoteInput` and returns cent amounts as decimal strings, avoiding JSON precision loss. `assess_supplier_reply` accepts `text` and optional nonnegative integer `counteroffers`. These handlers have not been tested against a live agent. The policy functions and database audit shape are implemented, but a backend call orchestrator must invoke them and maintain durable do-not-contact state before autonomous supplier calls.

## Structured intake and negotiation policy

`supabase/functions/normalize-intake` accepts a channel and source text, then asks `gpt-5.6-luna` by default for strict JSON matching `src/features/intake/schema.ts`. It extracts item, quantity, budget, deadline, terms, explicit conversation cues, missing fields and short evidence spans. Set `OPENAI_EXTRACTION_MODEL` to change the server-side model without changing the schema. The dashboard includes a local transparent preview; the deployed function is not called until Supabase and its secrets are configured.

Competitor pricing can be used only as an anonymous market anchor when the owner enables it and the quote is verified and comparable on product, quantity, fees and delivery window. The agent cannot reveal the supplier, invent a price, or use the rule to exceed other bounds. It stops bargaining after two counteroffers, escalates substitutions, and immediately ends contact on an opt-out.

Every call starts with the represented business, AI identity, quote-only purpose, opt-out language and a callback number. The contact policy requires a verified ABN, owner authorisation, business-hours contact and fewer than two attempts that day. Transcript cues adapt pacing only when the supplier explicitly signals time pressure, frustration, a final offer or a request to stop.

## Supabase setup

Project credentials are deliberately blank in `.env.example`.

1. Copy `.env.example` to `.env.local`. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from your project (use a `sb_publishable_` key).
2. Apply both files in `supabase/migrations` in timestamp order using the Supabase CLI migration workflow. They have not been applied remotely.
3. Set Edge Function secrets with `supabase secrets set OPENAI_API_KEY=... OPENAI_EXTRACTION_MODEL=gpt-5.6-luna`, then deploy `normalize-intake` when ready.
4. Create an owner email/password account in Supabase Authentication. The UI provides sign-in, not open registration. Disable public sign-ups in the hosted project if it should be invite-only.
5. Restart Vite and sign in. Create a request or import a supplier, refresh, and confirm it persists. Verify a second account cannot see the first owner's records.

Blank settings preserve demo mode; incomplete settings show a configuration error. A database/network failure never silently falls back to sample data. One owner is one workspace in this initial schema; shared business/team membership is future work. Browser users can insert requests/imports and read their own rows. They cannot forge ABR results, supplier quotes, or call records. Only a request already marked Needs approval by a backend job can transition to Approved; this records a decision and does not place an order. Client-supplied request details still require deterministic backend validation before any external action.

Protected schema tables for quotes, calls, registry evidence, normalized intake and agent decision audits are ready for backend jobs; the live quote and transcript UI is not yet connected to those tables. Imports therefore stay pending until the ABR integration is implemented.

`bun test` runs the migration in embedded Postgres with an emulated `auth.uid()` and checks owner isolation, protected columns, anonymous denial, and backend-only verification writes. This validates SQL/RLS but not hosted Supabase Auth, PostgREST, or Edge Functions. Docker is not running, so the local Supabase stack and advisors were not run. Run hosted security advisors and the two-account smoke test after applying the migration.
