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
            const scoped = pool.filter(
              (s) => s.label.toLowerCase().includes(needle) || s.id.startsWith(params.day ?? ''),
            )
            if (scoped.length > 0) pool = scoped
          }
          if (pool.length === 0)
            return 'No open slots match. The clinic is open Mon-Sat, 9 AM to 5 PM.'
          return `Open slots (slot_id: time): ${pool
            .slice(0, 12)
            .map((s) => `${s.id}: ${s.label}`)
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
          const res = await fetch(
            `/api/appointments/${encodeURIComponent(params.confirmation_code)}`,
          )
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

  const lcdStatus = !AGENT_ID
    ? 'NO AGENT CONFIGURED'
    : status === 'connecting'
      ? 'DIALING…'
      : live
        ? isSpeaking
          ? 'LINE 1 · DESK SPEAKING'
          : 'LINE 1 · LISTENING'
        : 'ON HOOK · READY'

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-20">
      <header className="flex items-center justify-between pt-6 pb-8">
        <div className="device inline-flex items-center gap-3 px-4 py-2">
          <span className="screw" />
          <span className="text-sm font-bold tracking-[0.22em]">VOICEDESK</span>
          <span className="screw" />
        </div>
        <nav className="flex items-center gap-5 text-sm text-ink-soft">
          <button onClick={resetDemo} className="hover:text-ink hover:underline underline-offset-4">
            Reset demo
          </button>
          <a
            href="https://github.com/krabhi4/voicedesk"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink hover:underline underline-offset-4"
          >
            Source
          </a>
        </nav>
      </header>

      <section className="max-w-2xl pb-10">
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
          An AI receptionist you can pick up and talk to.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Press the red button and ask for an appointment. The agent checks the planner, writes
          real rows to Postgres, and every tool it uses prints on the receipt. Built by Kumar
          Abhishek.
        </p>
      </section>

      <div className="grid items-start gap-10 lg:grid-cols-[400px_1fr]">
        <section className="device p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between pb-4">
            <div className="flex items-center gap-2">
              <span className="screw" />
              <span className="text-[11px] font-bold tracking-[0.18em] text-ink-soft">
                RECEPTION CONSOLE
              </span>
            </div>
            <span className="screw" />
          </div>

          <div className="lcd px-4 py-3">
            <div className="font-lcd lcd-text text-xl leading-none">
              {lcdStatus}
              <span className="blink">_</span>
            </div>
            <div className="font-lcd lcd-dim mt-1 text-sm leading-none">
              CEDAR LANE CLINIC · MON-SAT 09-17
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between px-1">
            <div className="flex items-center gap-4">
              {[
                { label: 'PWR', cls: 'led-on-green' },
                {
                  label: 'MIC',
                  cls: live && !isSpeaking ? 'led-on-amber led-pulse' : 'led-off',
                },
                { label: 'SPK', cls: live && isSpeaking ? 'led-on-red led-pulse' : 'led-off' },
              ].map((led) => (
                <div key={led.label} className="flex items-center gap-1.5">
                  <span className={`led ${led.cls}`} />
                  <span className="text-[10px] font-bold text-ink-faint">{led.label}</span>
                </div>
              ))}
            </div>
            <div className="grille h-8 w-24 rounded-sm opacity-70" />
          </div>

          <div className="mt-6 flex flex-col items-center gap-4 pb-2">
            {AGENT_ID ? (
              <>
                <button
                  onClick={live ? endCall : startCall}
                  disabled={busy || status === 'connecting'}
                  className={`push-button flex size-24 items-center justify-center text-[13px] font-bold ${live ? 'is-down' : ''}`}
                >
                  {status === 'connecting' ? '···' : live ? 'HANG UP' : 'CALL'}
                </button>
                <p className="text-center text-xs leading-relaxed text-ink-faint">
                  Uses your microphone. Try “I’d like an
                  <br />
                  appointment tomorrow morning.”
                </p>
                {callError && (
                  <p className="text-center text-xs font-bold text-led-red">{callError}</p>
                )}
              </>
            ) : (
              <div className="device-inset p-4 text-sm leading-relaxed text-ink-soft">
                <p className="font-bold text-ink">One step left to go live:</p>
                <p className="mt-1">
                  Create the ElevenLabs agent from <span className="font-mono">docs/agent-setup.md</span>,
                  then set <span className="font-mono">NEXT_PUBLIC_ELEVENLABS_AGENT_ID</span>.
                </p>
              </div>
            )}
          </div>

          <div ref={transcriptRef} className="device-inset mt-3 max-h-64 overflow-y-auto px-4 py-3">
            {lines.length === 0 ? (
              <p className="font-mono text-xs text-ink-faint">
                * transcript prints here once a call starts *
              </p>
            ) : (
              <div className="space-y-2 font-mono text-[12.5px] leading-snug">
                {lines.map((line) => (
                  <p key={line.id} className="print-line">
                    <span
                      className={
                        line.who === 'desk' ? 'font-bold text-stamp-red' : 'font-bold text-ink-faint'
                      }
                    >
                      {line.who === 'desk' ? 'DESK>' : 'CALLR>'}
                    </span>{' '}
                    {line.text}
                  </p>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="min-w-0 space-y-10">
          <section className="paper px-6 pt-5 pb-6">
            <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
              <h2 className="font-mono text-lg font-bold">WEEK PLANNER</h2>
              <span className="font-mono text-xs text-ink-soft">
                Mon-Sat · 9:00-17:00 · {appointments.length} booked
              </span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-7 gap-x-3">
                {days.map((day) => (
                  <div key={day.date} className="min-w-0">
                    <div className="border-b border-ink/60 pb-1 text-center font-mono">
                      <span className="text-xs font-bold">{day.weekday}</span>{' '}
                      <span className="text-xs text-ink-soft">{day.monthDay}</span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto pt-1">
                      {day.slots.length === 0 ? (
                        <div className="pt-2 text-center font-mono text-[10px] text-ink-faint">
                          until tomorrow
                        </div>
                      ) : (
                        day.slots.map((slot) => {
                          const appt = appointments.find((a) => a.slotId === slot.id)
                          return (
                            <div
                              key={slot.id}
                              title={appt ? `${appt.patientName} · ${appt.code}` : slot.label}
                              className="flex h-[27px] items-center justify-between gap-1 font-mono text-[11px]"
                            >
                              <span className={slot.booked ? 'text-ink' : 'text-ink-faint'}>
                                {slot.time}
                              </span>
                              {appt ? (
                                <span className="stamp text-[9.5px] text-stamp-blue">
                                  {appt.patientName.split(' ')[0].toUpperCase()}
                                </span>
                              ) : null}
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

          <section className="mx-auto w-full max-w-md">
            <div className="receipt px-5 pt-4 pb-8 font-mono text-[12px] leading-relaxed">
              <div className="text-center">
                <p className="text-sm font-bold">VOICEDESK OPERATIONS</p>
                <p className="text-ink-soft">* every tool call, as it happens *</p>
                <p className="text-ink-soft">================================</p>
              </div>
              {ledger.length === 0 ? (
                <p className="py-4 text-center text-ink-faint">
                  receipt is empty
                  <br />
                  start a call and ask for an appointment
                </p>
              ) : (
                <div className="space-y-3 pt-2">
                  {ledger.map((entry) => (
                    <div key={entry.id} className="print-line">
                      <p>
                        <span className="text-ink-soft">{entry.at}</span>{' '}
                        <span className="font-bold">{entry.tool}</span>{' '}
                        <span
                          className={
                            entry.ok === false
                              ? 'stamp text-[10px] text-stamp-red'
                              : entry.ok === null
                                ? 'text-ink-faint'
                                : 'stamp text-[10px] text-stamp-blue'
                          }
                        >
                          {entry.ok === false ? 'ERR' : entry.ok === null ? '...' : 'OK'}
                        </span>
                      </p>
                      <p className="break-words text-ink-soft">{entry.args}</p>
                      <p className="break-words">&gt; {entry.result}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <footer className="mt-16 flex flex-wrap items-baseline justify-between gap-3 border-t border-ink/20 pt-5 text-xs text-ink-faint">
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
          with Next.js, ElevenLabs Agents, Prisma, and Postgres.
        </span>
        <span>Demo data resets freely. No real clinic was harmed.</span>
      </footer>
    </main>
  )
}
