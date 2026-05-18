import type { Metadata } from 'next';
import Script from 'next/script';
import { Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { PageSwitcher } from '@/components/PageSwitcher';
import { MemberPill } from '@/components/MemberPill';
import { SyncPill } from '@/components/SyncPill';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HermesWidget } from '@/components/hermes/HermesWidget';
import { HermesProvider } from '@/components/hermes/HermesContext';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = { title: 'KalkulAI Team OS' };

const themeBootstrap = `
(function(){try{
  var s = localStorage.getItem('theme');
  if (s === 'light') document.documentElement.classList.add('light');
}catch(e){}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
      </head>
      <body className={`${geist.variable} ${geistMono.variable} antialiased`}>
        <Suspense fallback={null}><HermesProvider>
          {/* Aurora background — fixed, behind everything */}
          <div className="aurora" aria-hidden>
            <div className="grid" />
            <div className="blob b1" />
            <div className="blob b2" />
            <div className="blob b3" />
            <div className="noise" />
          </div>

          {/* Floating glass header */}
          <header className="glass sticky top-[14px] z-30 mx-7 mt-[14px] flex items-center gap-[18px] px-[18px] py-3 max-md:mx-4 max-md:px-3.5 max-md:py-2.5">
            <div className="relative z-[1] flex min-w-0 items-center gap-[11px]">
              <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] text-white shadow-[0_4px_16px_-4px_rgba(91,140,255,0.6),0_0_0_1px_rgba(255,255,255,0.15)_inset]">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 4v8M4 8h4m0-4 4 4-4 4" />
                </svg>
              </span>
              <PageSwitcher />
            </div>
            <div className="flex-1" />
            <SyncPill />
            <MemberPill />
            <ThemeToggle />
          </header>

          <main className="px-7 pt-6 pb-20 max-md:px-4 max-md:pb-15">{children}</main>
          <HermesWidget />
        </HermesProvider></Suspense>
      </body>
    </html>
  );
}
