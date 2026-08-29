# VoiceDesk

An AI phone receptionist you can test in the browser. You press the call button, talk to it, and it books, reschedules, or cancels appointments in a Postgres database while a paper-style receipt on screen prints every tool call it makes.

I built it because voice agents are easy to fake in a video and hard to fake live. Here the calendar is real, the bookings survive a page refresh, and if the agent claims a slot is free you can see the `check_availability` call that told it so.

## How it works

The voice side is an ElevenLabs conversational agent connected over WebRTC through `@elevenlabs/react`. The agent has no backend access of its own. It gets four client tools that run in the browser: `check_availability`, `book_appointment`, `lookup_appointment`, and `cancel_appointment`. Each tool calls a Next.js route handler, writes its result onto the on-screen receipt, and returns a short string the agent reads back to the caller.

The API enforces what the model cannot be trusted to: a unique constraint on the slot column returns 409 when two callers race for the same time, booking requires an exact slot id that came from an availability check, and cancellation requires the confirmation code the caller was given. Slots are computed, not stored: Monday to Saturday, 9:00 to 17:00, 30 minutes each. Bookings are Prisma rows.

The agent's prompt forbids inventing availability, codes, or contact details. Since every claim it can make routes through a tool, the receipt doubles as an audit log of the whole call.

## Run it

```bash
pnpm install
cp .env.example .env   # set DATABASE_URL and NEXT_PUBLIC_ELEVENLABS_AGENT_ID
pnpm prisma migrate dev
pnpm dev
```

Creating the ElevenLabs agent takes about ten minutes. The exact system prompt and all four tool definitions are in [docs/agent-setup.md](docs/agent-setup.md).

The "Reset demo" button (`DELETE /api/appointments`) wipes the calendar and seeds three sample bookings.

## Stack

Next.js 16, TypeScript, Tailwind 4, ElevenLabs Agents, Prisma 7, PostgreSQL.

## Author

Kumar Abhishek. I build voice agents, LLM pipelines, and the boring API plumbing that makes them trustworthy. [github.com/krabhi4](https://github.com/krabhi4)
