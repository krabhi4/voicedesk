import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { slotLabel } from '@/lib/slots'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ code: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { code } = await params
  const appointment = await prisma.appointment.findUnique({
    where: { code: code.toUpperCase() },
  })
  if (!appointment) {
    return NextResponse.json({ error: 'No appointment found for that code.' }, { status: 404 })
  }
  return NextResponse.json({
    appointment: { ...appointment, slotLabel: slotLabel(appointment.slotId) },
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { code } = await params
  const appointment = await prisma.appointment
    .delete({ where: { code: code.toUpperCase() } })
    .catch(() => null)
  if (!appointment) {
    return NextResponse.json({ error: 'No appointment found for that code.' }, { status: 404 })
  }
  return NextResponse.json({
    cancelled: { ...appointment, slotLabel: slotLabel(appointment.slotId) },
  })
}
