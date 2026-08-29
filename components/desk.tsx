'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'

type SlotView = { id: string; time: string; label: string; booked: boolean }
type DayView = { date: string; weekday: string; monthDay: string; slots: SlotView[] }
type Appt = {
  code: string
  slotId: string
  slotLabel: string
  patientName: string
  reason: string
  phone?: string | null
}
type LedgerEntry = {
  id: number
  at: string
  tool: string
  args: string
  result: string
  ok: boolean | null
}
type Line = { id: number; who: 'caller' | 'desk'; text: string }

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ''

let seq = 0

function now() {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function Desk() {
  return (
    <ConversationProvider>
      <DeskInner />
    </ConversationProvider>
  )
}

function DeskInner() {
  const [days, setDays] = useState<DayView[]>([])
  const [appointments, setAppointments] = useState<Appt[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const [availRes, apptRes] = await Promise.all([
      fetch('/api/availability').then((r) => r.json()),
      fetch('/api/appointments').then((r) => r.json()),
    ])
    setDays(availRes.days ?? [])
    setAppointments(apptRes.appointments ?? [])
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [lines])

  const record = useCallback(
    async (tool: string, args: Record<string, unknown>, run: () => Promise<string>) => {
      const id = ++seq
      const entry: LedgerEntry = {
        id,
        at: now(),
        tool,
        args: JSON.stringify(args),
        result: '…',
        ok: null,
      }
      setLedger((l) => [entry, ...l].slice(0, 40))
      try {
        const result = await run()
        setLedger((l) => l.map((e) => (e.id === id ? { ...e, result, ok: true } : e)))
        refresh()
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong.'
        setLedger((l) => l.map((e) => (e.id === id ? { ...e, result: message, ok: false } : e)))
        refresh()
        return message
      }
    },
    [refresh],
  )

  const conversation = useConversation({
    clientTools: {
      check_availability: async (params: { day?: string }) =>
        record('check_availability', params, async () => {
          const res = await fetch('/api/availability')
          const data = await res.json()
          let pool: { id: string; label: string }[] = (data.days as DayView[]).flatMap((d) =>
            d.slots.filter((s) => !s.booked).map((s) => ({ id: s.id, label: s.label })),
          )
          if (params.day) {
            const needle = params.day.toLowerCase()
            const scoped = pool.filter((s) => s.label.toLowerCase().includes(needle) || s.id.startsWith(params.day ?? ''))
            if (scoped.length > 0) pool = scoped
          }
          if (pool.length === 0) return 'No open slots match. The clinic is open Mon-Sat, 9 AM to 5 PM.'
          return `Open slots (slot_id — time): ${pool
            .slice(0, 12)
            .map((s) => `${s.id} — ${s.label}`)
            .join('; ')}${pool.length > 12 ? ` (+${pool.length - 12} more)` : ''}`
        }),
      book_appointment: async (params: {
        slot_id: string
        patient_name: string
        reason: string
        phone?: string
      }) =>
        record('book_appointment', params, async () => {
          const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slotId: params.slot_id,
              patientName: params.patient_name,
              reason: params.reason,
              phone: params.phone,
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? 'Booking failed.')
          const a = data.appointment
          return `Booked ${a.slotLabel} for ${a.patientName}. Confirmation code ${a.code}.`
        }),
      lookup_appointment: async (params: { confirmation_code: string }) =>
        record('lookup_appointment', params, async () => {
          const res = await fetch(`/api/appointments/${encodeURIComponent(params.confirmation_code)}`)
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? 'Lookup failed.')
          const a = data.appointment
          return `${a.code}: ${a.patientName}, ${a.slotLabel}, reason: ${a.reason}.`
        }),
      cancel_appointment: async (params: { confirmation_code: string }) =>
        record('cancel_appointment', params, async () => {
          const res = await fetch(
            `/api/appointments/${encodeURIComponent(params.confirmation_code)}`,
            { method: 'DELETE' },
          )
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? 'Cancellation failed.')
          const a = data.cancelled
          return `Cancelled ${a.code} (${a.patientName}, ${a.slotLabel}). The slot is open again.`
        }),
    },
    onMessage: (message: { message: string; source: string }) => {
      if (!message?.message) return
      setLines((l) => [
        ...l,
        { id: ++seq, who: message.source === 'user' ? 'caller' : 'desk', text: message.message },
      ])
    },
  })

  const { status, isSpeaking } = conversation
  const live = status === 'connected'

  const startCall = useCallback(async () => {
    if (!AGENT_ID) return
    setBusy(true)
    setCallError(null)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      await conversation.startSession({ agentId: AGENT_ID })
      setLines([])
    } catch (err) {
      setCallError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow the mic and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not start the call.',
      )
    } finally {
      setBusy(false)
    }
  }, [conversation])

  const endCall = useCallback(async () => {
    await conversation.endSession()
  }, [conversation])

  const resetDemo = useCallback(async () => {
    await fetch('/api/appointments', { method: 'DELETE' })
    setLedger([])
    setLines([])
    refresh()
  }, [refresh])

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24">
      <header className="flex items-baseline justify-between border-b border-line pt-8 pb-5">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-2xl font-semibold tracking-tight">VoiceDesk</span>
          <span className="hidden text-xs uppercase tracking-[0.18em] text-vermilion sm:inline">
            Live demo
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm text-ink-soft">
          <button onClick={resetDemo} className="underline-offset-4 hover:text-ink hover:underline">
            Reset demo
          </button>
          <a
            href="https://github.com/krabhi4/voicedesk"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:text-ink hover:underline"
          >
            Source
          </a>
        </nav>
      </header>

      <section className="grid gap-x-12 gap-y-6 pt-10 pb-14 lg:grid-cols-[7fr_5fr]">
        <h1 className="font-display text-[clamp(2.1rem,5vw,3.4rem)] leading-[1.05] font-medium">
          A front desk that answers,
          <br />
          books, and <em className="text-vermilion not-italic">logs itself</em>.
        </h1>
        <p className="max-w-md self-end text-[15px] leading-relaxed text-ink-soft">
          Call the AI receptionist below. It checks a real calendar, writes real rows to Postgres,
          and every tool it uses appears in the ledger the moment it fires. Try booking, then ask
          it to cancel using your confirmation code.
        </p>
      </section>

      <div className="grid items-start gap-10 lg:grid-cols-[360px_1fr]">
        <section className="border border-line bg-paper-deep lg:sticky lg:top-6">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Reception line
            </span>
            <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em]">
              <span
                className={`inline-block size-2 rounded-full ${
                  live ? (isSpeaking ? 'bg-vermilion pip' : 'bg-moss pip') : 'bg-line'
                }`}
              />
              <span className="text-ink-soft">
                {live ? (isSpeaking ? 'Speaking' : 'Listening') : 'On hook'}
              </span>
            </span>
          </div>

          <div className="flex flex-col items-center gap-5 px-6 py-10">
            {AGENT_ID ? (
              <>
                <button
                  onClick={live ? endCall : startCall}
                  disabled={busy || status === 'connecting'}
                  className={`flex size-28 items-center justify-center rounded-full text-sm font-semibold tracking-wide transition-colors duration-300 disabled:opacity-60 ${
                    live
                      ? 'call-live bg-vermilion text-cream hover:bg-vermilion-deep'
                      : 'bg-ink text-cream hover:bg-vermilion'
                  }`}
                >
                  {status === 'connecting' ? 'Ringing…' : live ? 'End call' : 'Call'}
                </button>
                <p className="text-center text-xs leading-relaxed text-ink-faint">
                  Uses your microphone. Say something like
                  <br />
                  <span className="text-ink-soft">
                    “I’d like an appointment tomorrow morning.”
                  </span>
                </p>
                {callError && (
                  <p className="text-center text-xs leading-relaxed text-vermilion">{callError}</p>
                )}
              </>
            ) : (
              <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
                <p className="font-medium text-ink">One step left to go live:</p>
                <p>
                  Create an ElevenLabs agent using the prompt and tools in{' '}
                  <span className="font-mono text-[13px]">docs/agent-setup.md</span>, then set{' '}
                  <span className="font-mono text-[13px]">NEXT_PUBLIC_ELEVENLABS_AGENT_ID</span>.
                </p>
              </div>
            )}
          </div>

          <div
            ref={transcriptRef}
            className="max-h-72 space-y-4 overflow-y-auto border-t border-line px-5 py-4"
          >
            {lines.length === 0 ? (
              <p className="text-xs text-ink-faint">
                The transcript writes itself here once a call starts.
              </p>
            ) : (
              lines.map((line) => (
                <div key={line.id}>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
                      line.who === 'desk' ? 'text-vermilion' : 'text-ink-faint'
                    }`}
                  >
                    {line.who === 'desk' ? 'Desk' : 'Caller'}
                  </span>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink">{line.text}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="min-w-0 space-y-10">
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-medium">This week at the clinic</h2>
              <span className="text-xs text-ink-faint">
                Mon–Sat · 9:00–17:00 · {appointments.length} booked
              </span>
            </div>
            <div className="overflow-x-auto border border-line bg-cream">
              <div className="grid min-w-[640px] grid-cols-7 divide-x divide-line">
                {days.map((day) => (
                  <div key={day.date} className="min-w-0">
                    <div className="border-b border-line px-2 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                        {day.weekday}
                      </div>
                      <div className="font-display text-sm">{day.monthDay}</div>
                    </div>
                    <div className="max-h-[380px] space-y-px overflow-y-auto p-1">
                      {day.slots.length === 0 ? (
                        <div className="px-1 py-3 text-center text-[10px] text-ink-faint">
                          done for today
                        </div>
                      ) : (
                        day.slots.map((slot) => {
                          const appt = appointments.find((a) => a.slotId === slot.id)
                          return (
                            <div
                              key={slot.id}
                              title={appt ? `${appt.patientName} · ${appt.code}` : slot.label}
                              className={`flex items-center justify-between gap-1 px-1.5 py-[3px] text-[11px] ${
                                slot.booked
                                  ? 'bg-moss-wash font-medium text-moss'
                                  : 'text-ink-faint'
                              }`}
                            >
                              <span className="font-mono">{slot.time}</span>
                              {appt && (
                                <span className="truncate">{appt.patientName.split(' ')[0]}</span>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-medium">Operations ledger</h2>
              <span className="text-xs text-ink-faint">every tool call, as it happens</span>
            </div>
            {ledger.length === 0 ? (
              <p className="border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">
                The ledger fills as the agent works. Start a call and ask for an appointment.
              </p>
            ) : (
              <ol className="divide-y divide-line border border-line bg-cream font-mono text-[12.5px]">
                {ledger.map((entry) => (
                  <li key={entry.id} className="ledger-in grid gap-1 px-4 py-3 sm:grid-cols-[64px_170px_1fr]">
                    <span className="text-ink-faint">{entry.at}</span>
                    <span
                      className={
                        entry.ok === false
                          ? 'text-vermilion'
                          : entry.ok === null
                            ? 'text-ink-faint'
                            : 'text-moss'
                      }
                    >
                      {entry.tool}
                    </span>
                    <span className="min-w-0 break-words text-ink-soft">
                      <span className="text-ink-faint">{entry.args}</span>
                      <span className="mx-2 text-ink-faint">→</span>
                      {entry.result}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <footer className="mt-20 flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-5 text-xs text-ink-faint">
        <span>
          Built by{' '}
          <a
            href="https://github.com/krabhi4"
            target="_blank"
            rel="noreferrer"
            className="text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Kumar Abhishek
          </a>{' '}
          — Next.js, ElevenLabs Agents, Prisma, Postgres.
        </span>
        <span>Demo data resets freely. No real clinic was harmed.</span>
      </footer>
    </main>
  )
}
