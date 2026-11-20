import type { Metadata } from 'next';
import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Collections Prioritization Copilot: Snowflake example',
  description: 'Rank delinquent loans by roll risk and expected recovery, reach borrowers on the channel they answer, and review calls for compliance. Synthetic data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
