import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
export const metadata: Metadata = { title: 'KalkulAI Team OS' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={`${inter.className} min-h-screen bg-background`}>
        <nav className="border-b px-6 py-3 flex gap-6 text-sm items-center">
          <span className="font-bold mr-2">Team OS</span>
          <Link href="/dashboard" className="hover:text-foreground text-muted-foreground">Mein Tag</Link>
          <Link href="/dashboard/team" className="hover:text-foreground text-muted-foreground">Team</Link>
          <Link href="/settings" className="hover:text-foreground text-muted-foreground">Einstellungen</Link>
        </nav>
        <main className="container mx-auto p-6 max-w-4xl">{children}</main>
      </body>
    </html>
  );
}
