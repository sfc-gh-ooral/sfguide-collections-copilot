import type { Metadata } from 'next';
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Shell from '@/components/Shell';

// Self-hosted at build time by next/font (SIL Open Font License); no font CDN at runtime.
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-bricolage', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Calvessa Recovery Desk: Collections Prioritization Copilot on Snowflake',
  description: 'Rank delinquent loans by roll risk and expected recovery, reach borrowers on the channel and hour they answer, and review calls for compliance. Synthetic data.',
};

// Applies a saved theme before first paint so there is no flash.
const THEME = `try{var t=localStorage.getItem('cc-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${bricolage.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
