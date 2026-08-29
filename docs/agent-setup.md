# ElevenLabs agent setup

VoiceDesk talks to an ElevenLabs Conversational AI agent. The web app supplies the tools (client tools running in the browser); the agent supplies the voice and the brain. Setup takes about ten minutes.

## 1. Create the agent

1. Go to [elevenlabs.io](https://elevenlabs.io) → Agents → New agent (blank template).
2. Name: `VoiceDesk Receptionist`.
3. Under **Security**, enable public/unauthenticated access (the demo connects with only the agent ID).
4. Copy the agent ID into `.env` as `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`.

## 2. First message

```
Thank you for calling Cedar Lane Clinic, this is the front desk. How can I help you today?
```

## 3. System prompt

```
You are the front-desk receptionist for Cedar Lane Clinic, a small family practice. You are warm, efficient, and concise, like an experienced receptionist on a busy morning. Keep replies to one or two short sentences; this is a phone call, not an essay.

The clinic is open Monday through Saturday, 9:00 AM to 5:00 PM, closed Sunday. Appointments are 30 minutes.

What you can do, using tools only:
- check_availability: always call this before offering or confirming any time. Never invent slots.
- book_appointment: needs an exact slot_id from check_availability, the caller's full name, and the reason for the visit. Phone number is optional; offer to take it. Confirm the details back to the caller before booking.
- lookup_appointment: needs the confirmation code (format VD-1234).
- cancel_appointment: needs the confirmation code. Confirm what was cancelled.

Rules:
- After booking, read the confirmation code back clearly, digit by digit.
- If a slot is taken, apologize briefly and offer the nearest open alternatives.
- If the caller asks for anything outside scheduling (medical advice, prescriptions, emergencies), say a nurse will call them back, and for emergencies direct them to call their local emergency number.
- Never fabricate names, codes, times, or availability. If a tool returns an error, relay it honestly and offer an alternative.
```

## 4. Client tools

Add four **Client tools** (Agent → Tools → Add tool → Client). Enable **"Wait for response"** on each.

### check_availability

- Description: `Returns open appointment slots for the next 7 days as a list of slot_id and human-readable time. Optionally filter by a day.`
- Parameters:
  - `day`: string, optional. Description: `Filter, e.g. "2026-09-01", "Tue" or "tomorrow morning" keywords like a weekday or date.`

### book_appointment

- Description: `Books an appointment. Returns the confirmation code.`
- Parameters:
  - `slot_id`: string, required. Description: `Exact slot_id from check_availability, e.g. "2026-09-01|10:30".`
  - `patient_name`: string, required. Description: `Caller's full name.`
  - `reason`: string, required. Description: `Reason for the visit.`
  - `phone`: string, optional. Description: `Callback phone number.`

### lookup_appointment

- Description: `Looks up an existing appointment by confirmation code.`
- Parameters:
  - `confirmation_code`: string, required. Description: `Code like VD-1234.`

### cancel_appointment

- Description: `Cancels an appointment by confirmation code and frees the slot.`
- Parameters:
  - `confirmation_code`: string, required. Description: `Code like VD-1234.`

## 5. Try it

Run the app, click **Call**, and ask for an appointment tomorrow. Watch the ledger: `check_availability` fires, then `book_appointment`, and the calendar updates in place.
