import type { Metadata } from 'next'
import { Chivo, Courier_Prime, VT323 } from 'next/font/google'
import './globals.css'

const chivo = Chivo({
  subsets: ['latin'],
  variable: '--font-chivo',
})

const courier = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-courier',
})

const vt323 = VT323({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-vt323',
})

export const metadata: Metadata = {
  title: 'VoiceDesk: an AI front desk that answers, books, and logs itself',
  description:
    'Live demo: talk to an AI receptionist that checks a real calendar, books appointments into Postgres, and prints every tool call on a receipt as it happens. Built by Kumar Abhishek.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${chivo.variable} ${courier.variable} ${vt323.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
