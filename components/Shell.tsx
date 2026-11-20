'use client';

// Calvessa app frame: top bar with logo, tabs, the shift board, the role chip, the Sample/Live
// environment badge and a theme toggle; a sample-mode notice; and the disclaimer footer.
import { Bot, LayoutDashboard, ListChecks, Moon, ShieldCheck, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LogoMark } from '@/components/Logo';
import { ModeChip } from '@/components/ModeChip';
import { fetchOverview } from '@/lib/client';
import { HOSTED_EXAMPLE } from '@/lib/hosted';

const NAV = [
  { href: '/', label: 'Portfolio', icon: LayoutDashboard },
  { href: '/queue', label: "Today's queue", icon: ListChecks },
  { href: '/qa', label: 'Call QA', icon: ShieldCheck },
  { href: '/ask', label: 'Ask', icon: Bot },
];

function ThemeToggle() {
  const [dark, setDark] = useState<boolean>();
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  if (dark === undefined) return <span className="w-9" />;
  const flip = () => { const next = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('cc-theme', next); setDark(!dark); };
  return (
    <button className="btn !p-2" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title="Theme">
      {dark ? <Sun className="w-4 h-4" aria-hidden /> : <Moon className="w-4 h-4" aria-hidden />}
    </button>
  );
}

/** Today's shift at a glance: queue size, accounts needing a channel change, and flagged calls. */
function ShiftBoard() {
  const [s, setS] = useState<{ queue: number; evening: number; flagged: number }>();
  useEffect(() => { fetchOverview().then((o) => setS({ queue: o.kpis.queue, evening: o.stories.eveningTexters, flagged: o.stories.flaggedCalls }), () => {}); }, []);
  if (!s) return null;
  const item = (n: number, label: string, href: string, color: string) => (
    <Link href={href} className="flex flex-col leading-tight no-underline px-3 border-l first:border-l-0" style={{ borderColor: 'var(--line)' }}>
      <span className="display text-[15px] font-bold tabular" style={{ color }}>{n.toLocaleString()}</span>
      <span className="text-[10.5px] muted whitespace-nowrap">{label}</span>
    </Link>
  );
  return (
    <div className="hidden xl:flex items-center rounded-xl py-1.5" style={{ background: 'var(--surface-2)' }} aria-label="Shift board">
      {item(s.queue, 'in today’s queue', '/queue/', 'var(--dusk)')}
      {item(s.evening, 'better by evening text', '/queue/?filter=EVENING_SMS', 'var(--ember)')}
      {item(s.flagged, 'calls flagged in QA', '/qa/', 'var(--roll)')}
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href) || (href === '/queue' && pathname.startsWith('/account')));
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 btn z-50">Skip to content</a>
      {HOSTED_EXAMPLE && (
        <div role="note" className="px-4 md:px-8 py-2 text-xs tone-sample" style={{ borderRadius: 0 }}>
          <strong>Sample data mode.</strong> Runs in your browser on synthetic data captured from a live run; no Snowflake account needed. AI answers are scripted samples, not live Cortex output.{' '}
          <a href="https://github.com/sfc-gh-ooral/sfguide-collections-copilot" className="underline underline-offset-2 font-semibold">Run it in your own account</a>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 h-16 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 no-underline flex-none">
            <LogoMark size={34} />
            <span className="leading-tight">
              <span className="display block text-[16px] font-bold">Calvessa</span>
              <span className="block text-[10.5px] muted -mt-0.5">Recovery Desk</span>
            </span>
          </Link>
          <nav className="tabs hidden lg:flex ml-2" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="tab" aria-current={active(href) ? 'page' : undefined}><Icon className="w-4 h-4" aria-hidden />{label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ShiftBoard />
            <div className="hidden md:flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border" style={{ borderColor: 'var(--line)' }} title="Fictional user">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--ember)', color: 'var(--surface)' }}>DO</span>
              <span className="leading-tight"><span className="block text-xs font-semibold">Dana Okafor</span><span className="block text-[10.5px] muted">Collections lead</span></span>
            </div>
            <ModeChip />
            <ThemeToggle />
          </div>
        </div>
        <nav className="tabs lg:hidden px-3 pb-2" aria-label="Main (compact)">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="tab" aria-current={active(href) ? 'page' : undefined}><Icon className="w-4 h-4" aria-hidden />{label}</Link>
          ))}
        </nav>
      </header>
      <main id="main" key={pathname} className="rise flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-4 md:px-6 py-5">{children}</main>
      <footer className="border-t text-[11.5px] muted" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-4 flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>Calvessa and Northwind Financial are fictional. Synthetic data and illustrative logic: not a production collections system, and not legal, regulatory or compliance advice. Contact rules are illustrative.</span>
          <span>Business date Mon Nov 16, 2026 · Built on Snowflake</span>
        </div>
      </footer>
    </div>
  );
}
