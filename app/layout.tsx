import type { Metadata } from 'next'
import { Fraunces, Spline_Sans, Spline_Sans_Mono } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
})

const splineSans = Spline_Sans({
  subsets: ['latin'],
  variable: '--font-spline',
})

const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-spline-mono',
})

export const metadata: Metadata = {
  title: 'VoiceDesk — an AI front desk that answers, books, and logs itself',
  description:
    'Live demo: talk to an AI receptionist that checks a real calendar, books appointments into Postgres, and shows you every tool call as it happens. Built by Kumar Abhishek.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${splineSans.variable} ${splineMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
