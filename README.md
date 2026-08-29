# VoiceDesk

**A front desk that answers, books, and logs itself.**

Live demo of a production-pattern AI voice receptionist: you talk to it in the browser, it checks a real calendar, writes real rows to Postgres, and every tool call it makes appears in an on-screen operations ledger the moment it fires.

Built to demonstrate the architecture behind real voice-AI deployments: agent + typed tools + database + observable side effects.

## How it works

- **Voice agent**: ElevenLabs Conversational AI over WebRTC (`@elevenlabs/react`). The agent holds the conversation; the browser supplies four client tools.
- **Client tools** (`check_availability`, `book_appointment`, `lookup_appointment`, `cancel_appointment`) run in the browser, call the Next.js API, stream their results into the ledger UI, and return compact strings the agent can speak from.
- **API**: Next.js route handlers with validation, slot conflict handling (unique constraint, 409 on double-booking), and confirmation codes.
- **Data**: Prisma 7 + PostgreSQL. Slots are computed (Mon-Sat, 9:00-17:00, 30 min); bookings are rows.
- **Fail-honest by design**: the agent is instructed to never invent availability or codes; every claim it makes on the call maps to a tool result you can see in the ledger.

## Run it

```bash
pnpm install
cp .env.example .env   # set DATABASE_URL and NEXT_PUBLIC_ELEVENLABS_AGENT_ID
pnpm prisma migrate dev
pnpm dev
```

Then create the ElevenLabs agent (ten minutes): see [docs/agent-setup.md](docs/agent-setup.md) for the exact system prompt and tool definitions.

`DELETE /api/appointments` (the "Reset demo" button) clears the calendar and seeds three sample bookings.

## Stack

Next.js 16 · TypeScript · Tailwind 4 · ElevenLabs Agents · Prisma 7 · PostgreSQL

## Author

Kumar Abhishek — full-stack + AI voice agents & automation.
