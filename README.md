# SourcePilot

SourcePilot is a mobile-first voice procurement agent for Australian small businesses. Its AI assistant, Sarah, checks authorised, ABN-verified suppliers, calls them for quotes, compares the results, negotiates within approved limits, and presents the best option for purchase or confirmation.

## How it works

1. The owner speaks or types a procurement request.
2. SourcePilot asks only for missing details, then confirms the exact item, quantity, delivery address and deadline, all-in budget, substitutions, payment period, and deposit cap before sourcing starts.
3. The supplier list is filtered to businesses with a confirmed ABN and owner authorisation.
4. Suppliers are contacted by voice first, with SMS or email available for follow-up.
5. Quotes are normalised and ranked by total cost, availability, delivery, payment terms, reliability, and call sentiment.
6. SourcePilot negotiates within explicit price and payment-term limits.
7. A request can either require a separate owner approval or store an owner/admin pre-authorisation. Pre-authorised requests may issue one purchase order automatically only when every exact product, supplier, total, quantity, delivery, and payment rule passes. SourcePilot never initiates payment.
8. Once the purchase order is sent, SourcePilot calls the owner with the result and payment terms, falling back to SMS when configured calling is unavailable. It clearly says supplier acceptance is still pending.

The language model extracts details and prepares natural conversation. Deterministic application rules control supplier eligibility, negotiation limits, ranking, disclosure, and purchase approval.

## Organisation workspaces

Every account receives a personal organisation during signup, named from the user’s profile or email. Users can also create business organisations and switch between organisations they belong to. Procurement requests, suppliers, verification evidence, calls, quotes, policies, messages, decisions, and purchase orders are all scoped by `organization_id`; membership-based RLS prevents access from outside the organisation.

## Current features

- Mobile-first owner dashboard
- Orb UI voice interface with an ElevenLabs adapter
- Typed fallback for browsers without voice access
- Supplier importing with ABN validation states
- Melbourne supplier lead dataset for discovery testing
- Live public-web supplier discovery with attributable evidence and semantic product matching
- Live ABR verification and a separate owner-authorisation gate
- Durable, sequential ElevenLabs SIP calling queues with batch selection, atomic claims, retries, cancellation, live status, pre-dispatch trust checks, and per-call policy snapshots
- HMAC-verified post-call transcript ingestion and supplier-only structured quote extraction
- Audited supplier email, owner approval SMS, atomically reserved purchase orders, and idempotent owner completion calls with SMS fallback
- Quote comparison and supplier ranking
- Price and payment-term negotiation guardrails
- Sentiment, patience, and negotiation-readiness signals
- Fast deterministic negotiation calculations
- Supabase schema, row-level security policies, and intake Edge Function
- Personal and business organisation workspaces with membership-based isolation

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
supabase secrets set OPENAI_API_KEY=your_key OPENAI_EXTRACTION_MODEL=gpt-5.6-luna OPENAI_DISCOVERY_MODEL=gpt-5.6-terra OPENAI_EMBEDDING_MODEL=text-embedding-3-small ABR_AUTH_GUID=your_abr_guid ELEVENLABS_API_KEY=your_key ELEVENLABS_AGENT_ID=your_supplier_agent_id ELEVENLABS_OWNER_NOTIFICATION_AGENT_ID=your_owner_notification_agent_id ELEVENLABS_PHONE_NUMBER_ID=your_sip_phone_id ELEVENLABS_CALLBACK_NUMBER=+61390000000 ELEVENLABS_WEBHOOK_SECRET=your_webhook_secret CALLING_BUSINESS_NAME="Your Business" RESEND_API_KEY=your_key RESEND_FROM_EMAIL=procurement@example.com TWILIO_ACCOUNT_SID=your_sid TWILIO_AUTH_TOKEN=your_token TWILIO_SMS_FROM=+61... OWNER_APPROVAL_PHONE=+61... APP_BASE_URL=https://your-production-url.example
supabase functions deploy normalize-intake
supabase functions deploy verify-abn
supabase functions deploy discover-suppliers
supabase functions deploy start-supplier-call
supabase functions deploy elevenlabs-webhook --no-verify-jwt
supabase functions deploy procurement-action
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
supabase/functions/   Server-side intake, ABR, discovery, and call dispatch
supabase/migrations/  Database schema and security policies
data/                  Researched supplier lead exports
```

## Prototype status

The repository implements gap-driven intake clarification, ABR verification, importable evidence-backed web discovery, request-specific buying profiles, trust-gated ElevenLabs outbound queues, HMAC-verified transcript/quote ingestion, supplier email, owner approval SMS, purchase orders backed by explicit approval or stored request-scoped pre-authorisation, and final owner notification with the recorded delivery and payment terms. These workflows require provider credentials and deployed Supabase functions; production hosting is not yet confirmed in the repository. Imported or discovered suppliers must be verified, reviewed, and authorised by an owner or administrator before SourcePilot can contact or buy from them.
