import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isValidSlot, newCode, slotLabel } from '@/lib/slots'

export const dynamic = 'force-dynamic'

export async function GET() {
  const appointments = await prisma.appointment.findMany({ orderBy: { slotId: 'asc' } })
  return NextResponse.json({
    appointments: appointments.map((a) => ({ ...a, slotLabel: slotLabel(a.slotId) })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const slotId = typeof body?.slotId === 'string' ? body.slotId.trim() : ''
  const patientName = typeof body?.patientName === 'string' ? body.patientName.trim() : ''
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : null

  if (!slotId || !patientName || !reason) {
    return NextResponse.json(
      { error: 'slotId, patientName and reason are required.' },
      { status: 400 },
    )
  }
  if (!isValidSlot(slotId)) {
    return NextResponse.json(
      { error: 'That slot is not on the schedule. Check availability first.' },
      { status: 422 },
    )
  }

  try {
    const appointment = await prisma.appointment.create({
      data: { slotId, patientName, reason, phone, code: newCode() },
    })
    return NextResponse.json(
      { appointment: { ...appointment, slotLabel: slotLabel(appointment.slotId) } },
      { status: 201 },
    )
  } catch {
    return NextResponse.json(
      { error: 'That slot was just taken. Offer the caller a different time.' },
      { status: 409 },
    )
  }
}

export async function DELETE() {
  await prisma.appointment.deleteMany()
  const week = await import('@/lib/slots').then((m) => m.buildWeek())
  const samples = [
    { day: 1, index: 4, patientName: 'Meera Nair', reason: 'Follow-up consultation' },
    { day: 2, index: 9, patientName: 'Daniel Okafor', reason: 'Annual check-up' },
    { day: 4, index: 2, patientName: 'Sofia Alvarez', reason: 'Blood work review' },
  ]
  for (const s of samples) {
    const slot = week[s.day]?.slots[s.index]
    if (!slot) continue
    await prisma.appointment
      .create({
        data: { slotId: slot.id, patientName: s.patientName, reason: s.reason, code: newCode() },
      })
      .catch(() => null)
  }
  return NextResponse.json({ ok: true })
}
