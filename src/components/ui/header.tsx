'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Link000 } from '@/components/ui/skiper-ui/skiper40';

export function Header() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/submissions', label: 'History' },
  ];

  return (
    <header className="glass sticky top-0 z-50 border-b border-border/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20 transition-shadow group-hover:shadow-lg group-hover:shadow-primary/30">
            <span className="text-primary-foreground font-mono text-xs font-bold tracking-tighter">GS</span>
            <div className="absolute inset-0 rounded-lg bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Grade<span className="text-primary">Sense</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return isActive ? (
              <span
                key={link.href}
                className="relative px-3 py-1.5 rounded-md text-[13px] font-medium text-primary bg-primary/8"
              >
                {link.label}
              </span>
            ) : (
              <Link000
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 rounded-md text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link000>
            );
          })}
          <div className="w-px h-5 bg-border mx-2" />
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 hover:brightness-110 transition-all active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            New Submission
          </Link>
        </nav>
      </div>
    </header>
  );
}
