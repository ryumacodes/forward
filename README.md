# SourcePilot

SourcePilot is a mobile-first voice procurement agent for Australian small businesses. Its AI assistant, Sarah, checks authorised, ABN-verified suppliers, calls them for quotes, compares the results, negotiates within approved limits, and presents the best option for purchase or confirmation.

## Live demo

- Website: [https://forward-rust.vercel.app/](https://forward-rust.vercel.app/)

Sign in with your account, or create one with your email.

Test Email: sharonshaun2301@gmail.com
Test Password: password

### Demo video

[Watch the SourcePilot demo on YouTube](https://youtu.be/CrQwyHkrgFU)

## How it works

1. The owner speaks or types a procurement request.
2. SourcePilot asks only for missing details, then confirms the exact item, quantity, delivery address and deadline, all-in budget, substitutions, payment period, and deposit cap before sourcing starts.
3. The supplier list is filtered to businesses with a confirmed ABN and owner authorisation.
4. Suppliers are contacted by voice first, with SMS or email available for follow-up.
5. Quotes are normalised and ranked by total cost, availability, delivery, payment terms, reliability, and call sentiment.
6. SourcePilot negotiates within explicit price and payment-term limits.
7. A request can either require a separate owner approval or store an owner/admin pre-authorisation. Pre-authorised requests may issue one purchase order automatically only when every exact product, supplier, total, quantity, delivery, and payment rule passes. SourcePilot never initiates payment.
8. Once the purchase order is sent, SourcePilot calls the owner with the result and payment terms. A declined, busy, unanswered, unavailable, or voicemail call triggers both an SMS and an AgentMail email. It clearly says supplier acceptance is still pending.

The language model extracts details and prepares natural conversation. Deterministic application rules control supplier eligibility, negotiation limits, ranking, disclosure, and purchase approval.

## Organisation workspaces

Every account receives a personal organisation during signup, named from the user’s profile or email. Users can also create business organisations and switch between organisations they belong to. Procurement requests, suppliers, verification evidence, calls, quotes, policies, messages, decisions, and purchase orders are all scoped by `organization_id`; membership-based RLS prevents access from outside the organisation. Organisations can hold several people: an owner or administrator adds another account by email. Every request records who started it, and Sarah routes approval requests and completion calls only back to that person — never to the whole team.

## Current features

- Mobile-first owner dashboard
- Orb UI voice interface with an ElevenLabs adapter
- Typed fallback for browsers without voice access
- Supplier importing with ABN validation states
- Melbourne supplier lead dataset for discovery testing
- On-demand OpenStreetMap proximity view with clearly labelled suburb-centroid distance estimates
- Live public-web supplier discovery with attributable evidence and semantic product matching
- Live ABR verification and a separate owner-authorisation gate
- Durable, sequential ElevenLabs SIP calling queues with batch selection, atomic claims, retries, cancellation, live status, pre-dispatch trust checks, and per-call policy snapshots
- HMAC-verified post-call transcript ingestion and supplier-only structured quote extraction
- Audited supplier email, owner approval SMS, atomically reserved purchase orders, and idempotent owner completion calls with SMS plus AgentMail fallback
- Multi-person organisations with per-profile contact details and request starters, so owner-facing notifications reach the exact person who started the request
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

`OPENAI_API_KEY` is a server-side Supabase Edge Function secret. Do not expose it through a `VITE_` variable. Twilio API-key authentication is supported with `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, and `TWILIO_API_KEY_SECRET`; `TWILIO_AUTH_TOKEN` remains a fallback.

## Supabase setup

Link the Supabase CLI to your project, then apply the migrations and deploy the intake normalisation function:

```bash
supabase db push
supabase secrets set OPENAI_API_KEY=your_key OPENAI_EXTRACTION_MODEL=gpt-5.6-luna OPENAI_DISCOVERY_MODEL=gpt-5.6-terra OPENAI_EMBEDDING_MODEL=text-embedding-3-small ABR_AUTH_GUID=your_abr_guid ELEVENLABS_API_KEY=your_key ELEVENLABS_AGENT_ID=your_supplier_agent_id ELEVENLABS_OWNER_NOTIFICATION_AGENT_ID=your_owner_notification_agent_id ELEVENLABS_PHONE_NUMBER_ID=your_sip_phone_id ELEVENLABS_CALLBACK_NUMBER=+61390000000 ELEVENLABS_WEBHOOK_SECRET=your_webhook_secret CALLING_BUSINESS_NAME="Your Business" RESEND_API_KEY=your_key RESEND_FROM_EMAIL=procurement@example.com TWILIO_ACCOUNT_SID=your_sid TWILIO_AUTH_TOKEN=your_token TWILIO_SMS_FROM=+61... OWNER_APPROVAL_PHONE=+61... OWNER_NOTIFICATION_EMAIL=owner@example.com AGENTMAIL_API_KEY=your_key AGENTMAIL_INBOX_ID=your_inbox_id APP_BASE_URL=https://your-production-url.example
supabase functions deploy normalize-intake
supabase functions deploy verify-abn
supabase functions deploy discover-suppliers
supabase functions deploy start-supplier-call
supabase functions deploy elevenlabs-webhook --no-verify-jwt
supabase functions deploy procurement-action
```

Database migrations live in `supabase/migrations`. Register for the free ABN Lookup web service to obtain the server-side `ABR_AUTH_GUID`; a checksum alone is never shown as official registry verification. Discovery searches public supplier pages, rejects private/local URLs before retrieval, stores a bounded text excerpt plus its source and embedding, and presents results as leads—not authorised suppliers. Until Supabase credentials are configured, the app uses its clearly labelled prototype data.

The sample proximity view uses cached suburb centroids and Haversine straight-line distance, not exact address geocoding or route distance. OpenStreetMap tiles load only when the owner opens the map and retain visible contributor attribution. Production geocoding must be server-side, cached, rate-limited, provider-configurable, and record its source and precision.

Enable the ElevenLabs voicemail-detection system tool on the owner-notification agent. Busy, declined, and no-answer outcomes arrive as call-initiation failures; voicemail is detected from that system tool in the signed post-call transcript. Approval and completion notifications go to the person who started each request, using their profile phone/email and falling back to their Supabase Auth email or the `OWNER_APPROVAL_PHONE` / `OWNER_NOTIFICATION_EMAIL` secrets. AgentMail is used only for owner fallback notifications; Resend remains responsible for supplier briefs and purchase orders.

To create or update Sarah and her browser-side procurement tools, set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in an ignored local environment file, then run `bun run provision:voice`. Copy the returned agent ID to both `VITE_ELEVENLABS_AGENT_ID` and `ELEVENLABS_AGENT_ID`. The command is idempotent: it reuses tools and the named agent when they already exist.

The live voice checks use a dedicated Chrome instance with remote debugging and synthetic microphone permission. `bun run test:voice-provider` uses direct CDP events to verify a real two-turn ElevenLabs session, audio output, client-tool invocation, and browser console health. `bun run test:cdp` drives the configured app through that same CDP endpoint; set `E2E_EMAIL` and `E2E_PASSWORD` to an explicitly authorised test account when Supabase authentication is enabled. Neither test captures screenshots or traces.

## Commands

```bash
bun run dev      # start the development server
bun run build    # type-check and create a production build
bun test         # run the test suite
bun run test:e2e # run desktop and mobile browser workflows
bun run provision:voice    # create/update Sarah and the six ElevenLabs client tools
bun run test:voice-provider # CDP-check live speech, a real turn, and a client tool
bun run test:cdp            # CDP-check the authenticated app and microphone session
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

The repository implements gap-driven intake clarification, ABR verification, importable evidence-backed web discovery, request-specific buying profiles, trust-gated ElevenLabs outbound queues, HMAC-verified transcript/quote ingestion, supplier email, owner approval SMS, purchase orders backed by explicit approval or stored request-scoped pre-authorisation, and final owner notification with SMS plus AgentMail fallback when a call is not answered. A hosted demo is available at [forward-rust.vercel.app](https://forward-rust.vercel.app/); live provider workflows require their credentials and deployed Supabase functions. Imported or discovered suppliers must be verified, reviewed, and authorised by an owner or administrator before SourcePilot can contact or buy from them.
