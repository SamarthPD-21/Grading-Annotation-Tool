import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/ui/header';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'GradeSense — AI-Powered Assessment & Annotation',
  description:
    'Upload answer papers, auto-grade against structured rubrics with AI, and produce precise editable annotations with deterministic scoring.',
  keywords: ['grading', 'AI', 'annotation', 'rubric', 'assessment', 'PDF'],
  authors: [{ name: 'GradeSense' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="border-t border-border/40 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>© 2026 GradeSense</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-subtle" />
              System Operational
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
