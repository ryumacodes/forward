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

All supplier records, transcripts, and metrics are illustrative. New requests and approvals live only in React state and reset on refresh. No real phone calls, SMS, email, orders, recordings, or authentication are connected. The offer deadline flag is sample data, not a production timestamp validator. Additional requests deliberately show an empty quote state instead of fabricated offers.

## Next integration

Connect ABN verification for the owner-authorised supplier list and ElevenLabs outbound calls, persist requests and offers, extract structured quotes, and replace fixture deadline flags with timezone-aware validation. The intended flow is: speak item/deadline/budget → check authorised, ABN-verified suppliers → call and normalise quotes → purchase within explicit authorisation or call/text the owner for confirmation. No ABNs have been verified in this prototype. Voice is the primary supplier contact channel; SMS/email are follow-ups. The application is owner-facing; a customer/supplier chatbot is outside this first slice.

## Structure

- `src/App.tsx`: owner workspace and navigation
- `src/components/NewRecovery.tsx`: recovery request dialog
- `src/features/recoveries/data.ts`: typed fixtures and constraint checks
- `src/styles.css`: theme and responsive layouts

Do not commit credentials. `.gitignore` excludes environment files, dependencies, build output, and local tool artifacts while allowing `.env.example`.

## Voice orb

Voice intake uses [Orb UI](https://orb-ui.com/) with `theme="cloud"`. Browser speech recognition drives the unconfigured demo. To enable a public ElevenLabs agent, copy `.env.example` to `.env.local`, set `VITE_ELEVENLABS_AGENT_ID`, and restart Vite. The official Orb UI ElevenLabs adapter owns session start/stop and supplies listening/speaking states and volume. User speech is captured in the request text. Agent sessions have not been live-tested without a configured agent.

Private agents require a server endpoint for signed URLs or conversation tokens. Never expose API keys through Vite environment variables. Closing the dialog stops its session. Purchasing tools and structured procurement parsing remain unconnected.

## Supplier assessment and payment terms

Quote rankings show requirement failures, price headroom, demo on-time history, and payment terms. Requests capture minimum days from invoice and maximum deposit. Counteroffers show original versus offered terms and fees; out-of-policy terms require confirmation. The purchase eligibility function also requires explicit pre-authorisation, supplier authorisation, and ABN verification. All fixture ABNs are unverified, preventing live eligibility. Ranking does not authorise a purchase. Run `bun test` for the ranking and authorisation checks.
