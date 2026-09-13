# SourcePilot implementation roadmap

SourcePilot is positioned as an emergency and everyday procurement agent for owner-operated businesses that do not have a procurement team. Every workflow must preserve owner control, supplier trust, evidence, and deterministic financial guardrails.

## Build order

- [x] Structured owner intake
  - Voice, typed requests, email, SMS, and forms normalize into one schema.
  - The owner reviews extracted values, missing fields, confidence, and source evidence before creating a procurement request.
  - A local deterministic fallback keeps the demo usable without credentials.
  - The live path is implemented and requires the Supabase function and OpenAI secret to be deployed in the target environment.
- [x] Live ABR verification
  - Check active status, legal name, GST registration, location, and verification freshness.
  - Never treat an ABN checksum as registry verification.
  - The authenticated server path and owner-authorisation gate are implemented; deployment requires a registered `ABR_AUTH_GUID`.
- [x] Supplier discovery and evidence retrieval
  - Retrieve local candidates, attach source evidence, and use semantic product matching.
  - Apply hard eligibility gates before weighted ranking.
  - The authenticated server path now performs web search, SSRF-guarded page extraction, 1,536-dimension embeddings, evidence persistence, and semantic lead ranking; deployment requires the migration, function, and OpenAI secret.
- [x] Trust-governed outbound calls
  - Use a stable Australian caller ID, clear AI disclosure, source disclosure, business-hours limits, opt-outs, and a two-minute first-call target.
  - Offer written verification and escalate frustration, uncertainty, or unusual terms.
  - The server dispatch path now re-checks live ABR evidence, owner authorisation, opt-out, business hours, a rolling two-attempt limit, identity, and callback configuration before initiating one ElevenLabs SIP call. It records the decision and immutable policy snapshot; deployment requires Australian caller ID and provider secrets.
- [x] Live transcript and quote ingestion
  - Persist provider events and normalize real transcripts into comparable supplier quotes.
  - Remove static quotes from the connected workspace.
  - HMAC-verified, idempotent post-call ingestion now stores provider transcripts, applies supplier opt-outs, extracts only supplier-stated quote facts with evidence, reconciles totals in code, flags incomplete terms, and feeds connected-workspace rankings.
- [x] Durable supplier calling queue
  - Authorised suppliers can be queued in priority order; an atomic lease-based claim permits one active call per request, provider failures retry safely, missing completion webhooks become reviewable, and verified webhook completion advances the next supplier.
- [x] Email, SMS, approvals, and purchasing
  - Send written briefs and approval requests through audited channels.
  - Never place a purchase outside explicit owner/admin authority or a stored request-scoped pre-authorisation.
  - Resend supplier briefs and purchase orders use an audited idempotent outbox; Twilio owner-approval SMS is single-attempt and links back to the app. Purchase orders are atomically reserved after a fresh server-side recheck of ABR, authorisation, opt-out, quote completeness, budget, quantity, delivery, payment, deposit, certification, and substitution rules. Pre-authorised requests can issue one PO automatically when every rule passes. No automatic payment exists.
- [ ] Production deployment and evaluation
  - Publish a stable URL, rehearse the live demo path, and document costs and operational limitations.
  - Measure extraction accuracy, missing-field recall, supplier eligibility decisions, ranking consistency, and negotiation-policy violations.

## Architecture rule

Models extract, retrieve, summarize, and converse. Deterministic application code controls eligibility, calculations, negotiation bounds, contact permission, disclosures, approvals, and purchases.
