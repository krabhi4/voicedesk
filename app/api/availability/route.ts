import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildWeek } from '@/lib/slots'

export const dynamic = 'force-dynamic'

export async function GET() {
  const booked = await prisma.appointment.findMany({ select: { slotId: true } })
  const bookedIds = new Set(booked.map((b) => b.slotId))
  const days = buildWeek().map((day) => ({
    ...day,
    slots: day.slots.map((slot) => ({ ...slot, booked: bookedIds.has(slot.id) })),
  }))
  return NextResponse.json({ days })
}
