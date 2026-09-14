# Isolated local demo

This branch includes a browser-local test environment for demonstrating supplier discovery and negotiation without using production Supabase, OpenAI, ElevenLabs, Twilio, Resend, or AgentMail credentials.

## Start

Add this line to the ignored `.env.local` file:

```dotenv
VITE_LOCAL_DEMO_MODE=true
```

Then run:

```bash
npm run dev
```

The local flag takes precedence over configured browser-side provider values. Remove it or set it to `false` to restore the normal connected workspace.

## Demo flow

1. Enter the workspace and open **Suppliers**.
2. Run **Find live suppliers**. The localhost-only development endpoint searches the public web, retrieves safe HTTPS supplier pages at request time, and ranks them with local, explainable term overlap. It uses no paid model.
3. Import a result to prove the evidence-to-supplier handoff.
4. Select **Add temporary supplier**, run the clearly labelled registry simulation, and authorise it.
5. A separate supplier-responder tab opens. Answer Sarah's simulated call.
6. Submit an out-of-bounds quote. Sarah identifies the exact budget, payment, and deposit violations and makes a bounded counteroffer.
7. Submit corrected terms. The dashboard receives the quote and transcript immediately through a browser `BroadcastChannel` and persists them in IndexedDB.
8. Open **Call activity** to review the conversation evidence. Reload the app to demonstrate persistence.

The registry and telephone actions are simulations and are labelled as such. The public-page retrieval is live. No SMS, email, purchase order, external call, or payment is sent.

## Verification

```bash
npm run build
npx --yes bun test
npm run test:e2e
npm run test:local-demo
```

