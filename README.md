# Backfill

Backfill is a mobile-first voice procurement agent for Australian small businesses. An owner describes what they need, when they need it, and their budget. Backfill checks authorised, ABN-verified suppliers, calls them for quotes, compares the results, negotiates within approved limits, and presents the best option for purchase or confirmation.

## How it works

1. The owner speaks or types a procurement request.
2. Backfill converts it into a structured brief with quantities, delivery timing, budget, and payment preferences.
3. The supplier list is filtered to businesses with a confirmed ABN and owner authorisation.
4. Suppliers are contacted by voice first, with SMS or email available for follow-up.
5. Quotes are normalised and ranked by total cost, availability, delivery, payment terms, reliability, and call sentiment.
6. Backfill negotiates within explicit price and payment-term limits.
7. An order proceeds automatically only when it fits a pre-authorised policy. Every other order is returned to the owner for approval by call or text.

The language model extracts details and prepares natural conversation. Deterministic application rules control supplier eligibility, negotiation limits, ranking, disclosure, and purchase approval.

## Current features

- Mobile-first owner dashboard
- Orb UI voice interface with an ElevenLabs adapter
- Typed fallback for browsers without voice access
- Supplier importing with ABN validation states
- Melbourne supplier lead dataset for discovery testing
- Live public-web supplier discovery with attributable evidence and semantic product matching
- Live ABR verification and a separate owner-authorisation gate
- Quote comparison and supplier ranking
- Price and payment-term negotiation guardrails
- Sentiment, patience, and negotiation-readiness signals
- Fast deterministic negotiation calculations
- Supabase schema, row-level security policies, and intake Edge Function

## Tech stack

- React 19 and TypeScript
- Vite
- Orb UI
- ElevenLabs Conversational AI
- Supabase Postgres and Edge Functions
- Bun test runner

## Local setup

Requirements: Bun and a Supabase project.

```bash
bun install
cp .env.example .env.local
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

Add the following values to `.env.local`:

```dotenv
VITE_ELEVENLABS_AGENT_ID=your_agent_id
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

`OPENAI_API_KEY` is a server-side Supabase Edge Function secret. Do not expose it through a `VITE_` variable.

## Supabase setup

Link the Supabase CLI to your project, then apply the migrations and deploy the intake normalisation function:

```bash
supabase db push
supabase secrets set OPENAI_API_KEY=your_key OPENAI_EXTRACTION_MODEL=gpt-5.6-luna OPENAI_DISCOVERY_MODEL=gpt-5.6-terra OPENAI_EMBEDDING_MODEL=text-embedding-3-small ABR_AUTH_GUID=your_abr_guid
supabase functions deploy normalize-intake
supabase functions deploy verify-abn
supabase functions deploy discover-suppliers
```

Database migrations live in `supabase/migrations`. Register for the free ABN Lookup web service to obtain the server-side `ABR_AUTH_GUID`; a checksum alone is never shown as official registry verification. Discovery searches public supplier pages, rejects private/local URLs before retrieval, stores a bounded text excerpt plus its source and embedding, and presents results as leads—not authorised suppliers. Until Supabase credentials are configured, the app uses its clearly labelled prototype data.

## Commands

```bash
bun run dev      # start the development server
bun run build    # type-check and create a production build
bun test         # run the test suite
```

## Project structure

```text
src/components/       Dashboard and procurement workflow UI
src/features/         Supplier, intake, voice, and negotiation logic
src/lib/              Shared utilities and Supabase client
supabase/functions/   Server-side intake, ABR, and evidence retrieval
supabase/migrations/  Database schema and security policies
data/                  Researched supplier lead exports
```

## Prototype status

The repository currently implements connected intake, ABR verification, and evidence-backed web discovery server paths, but they still require deployment credentials. Live outbound calls, SMS and email delivery, purchasing, and call recording remain to be connected. Imported or discovered suppliers must be verified, reviewed, and authorised by the business owner before Backfill can contact them.
