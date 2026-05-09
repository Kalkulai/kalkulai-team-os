import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { GlobalMemberSwitcher } from '@/components/GlobalMemberSwitcher';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
export const metadata: Metadata = { title: 'KalkulAI Team OS' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={`${inter.className} relative min-h-screen bg-background text-foreground antialiased`}>
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,oklch(0.97_0.02_260/0.6),transparent_60%),radial-gradient(ellipse_60%_40%_at_100%_100%,oklch(0.96_0.03_30/0.4),transparent_60%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,oklch(0.32_0.04_260/0.5),transparent_60%),radial-gradient(ellipse_60%_40%_at_100%_100%,oklch(0.30_0.04_30/0.4),transparent_60%)]"
        />
        <nav className="sticky top-0 z-20 flex items-center gap-6 border-b border-foreground/[0.06] bg-background/70 px-4 py-3 text-sm backdrop-blur-xl sm:px-6">
          <span className="mr-2 font-semibold tracking-tight">Team OS</span>
          <Link href="/dashboard" className="text-muted-foreground transition-colors hover:text-foreground">Mein Tag</Link>
          <Link href="/dashboard/team" className="text-muted-foreground transition-colors hover:text-foreground">Team</Link>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/settings" className="text-muted-foreground transition-colors hover:text-foreground">Einstellungen</Link>
            <GlobalMemberSwitcher />
          </div>
        </nav>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
