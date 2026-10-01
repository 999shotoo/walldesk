"use client"
import React from 'react';
// Not next/link: it calls preventDefault() and navigates from its own click
// handler, which fires before the document-level delegation `auto` mode uses —
// so the transition was always skipped. This Link routes through the provider.
import { Link } from 'next-transition-router';
import { usePathname } from 'next/navigation';
import { Home, Library, Palette, Search, Settings } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useIsOffline } from '@/lib/offline';
import { OfflineBanner } from '@/components/common/offline';
import { SmoothScroll } from '@/components/common/smooth_scroll';

type NavItem = {
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  /**
   * Whether this destination is useless without a connection. Set on everything
   * that browses the catalogue; Collections stays reachable because Downloads
   * lives inside it, and Settings is entirely local.
   */
  requiresNetwork?: boolean;
};

// Everyday browse destinations, grouped in the centre.
const menuItems: NavItem[] = [
  { href: '/', icon: Home, label: 'Home', requiresNetwork: true },
  { href: '/search', icon: Search, label: 'Search', requiresNetwork: true },
  // Favorites lives at /collections/favorites now, alongside imported
  // collections — the prefix match below keeps this lit for both.
  { href: '/collections', icon: Library, label: 'Collections' },
  { href: '/colors', icon: Palette, label: 'Colors', requiresNetwork: true },
];

// Pinned to the bottom, away from the browse group — it configures the app
// rather than being another place to look at wallpapers.
const bottomItems: NavItem[] = [
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const offline = useIsOffline();

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    // Exact match for the root, prefix match elsewhere, so a nested
    // route keeps its section highlighted.
    const isActive =
      item.href === '/'
        ? pathname === '/'
        : pathname.startsWith(item.href);

    const base =
      'w-9 h-9 rounded-xl flex items-center justify-center transition-[background-color,color,box-shadow,transform,opacity] duration-200 ease-out active:scale-90';

    // Greyed out and inert rather than hidden: a nav that loses items when the
    // connection drops reads as the app breaking. This reads as the app knowing.
    if (offline && item.requiresNetwork) {
      return (
        <span
          key={item.href}
          title={`${item.label} is unavailable offline`}
          aria-label={`${item.label} (unavailable offline)`}
          aria-disabled="true"
          className={cn(base, 'text-muted-foreground cursor-not-allowed opacity-40')}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          base,
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-transparent text-primary hover:bg-primary/10'
        )}
      >
        <Icon size={18} strokeWidth={2} />
      </Link>
    );
  };

  return (
    <div className="flex h-full bg-background ">
      {/* Sidebar. The border and shadow are load-bearing, not decoration: the
          rail is only a few lightness steps above the shell, and without an
          edge it reads as part of the background rather than a floating panel. */}
      <div className="w-14 bg-card border-border/70 shadow-sm rounded-xl border z-50 m-2 flex flex-col items-center gap-3 py-2 shrink-0">
        {/* Logo at top */}
        <Link href="/" className="w-full flex items-center justify-center pt-2" aria-label="WallDesk home">
          <div className="group w-9 h-9 bg-primary rounded-xl flex items-center justify-center transition-transform duration-300 ease-out hover:rotate-6 hover:scale-105 active:scale-90">
            <div className="w-6 h-6 bg-primary-foreground rounded-full transition-transform duration-300 group-hover:scale-90" />
          </div>
        </Link>

        {/* `flex-1` lets this group take the slack and centre itself, which is
            what pushes the settings nav below to the very bottom. */}
        <nav className="flex-1 flex flex-col items-center justify-center gap-1">
          {menuItems.map(renderItem)}
        </nav>

        <nav className="flex flex-col items-center gap-1 pb-1">
          {bottomItems.map(renderItem)}
        </nav>
      </div>

      {/* Main Content Area. A column so the offline banner can sit above the
          scroller rather than inside it — a notice that scrolls out of view is
          one the user stops seeing about thirty pixels into the page. */}
      <div className="flex-1 my-2 mr-2 flex min-h-0 flex-col">
        <OfflineBanner />

        {/* Owns the scrolling element itself, since it may have Lenis attached to
            it — the container and the smooth-scroll setting cannot be separated. */}
        <SmoothScroll>{children}</SmoothScroll>
      </div>
    </div>
  );
}
