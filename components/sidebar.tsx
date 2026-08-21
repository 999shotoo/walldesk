"use client"
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Home, Palette, Search, Settings } from 'lucide-react';

import { cn } from '@/lib/utils';
import { SCROLL_CONTAINER_ATTR } from '@/lib/use_wallpaper_feed';

// Everyday browse destinations, grouped in the centre.
const menuItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/search', icon: Search, label: 'Search' },
  { href: '/favorites', icon: Heart, label: 'Favorites' },
  { href: '/colors', icon: Palette, label: 'Colors' },
];

// Pinned to the bottom, away from the browse group — it configures the app
// rather than being another place to look at wallpapers.
const bottomItems = [
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  const renderItem = (item: (typeof menuItems)[number]) => {
    const Icon = item.icon;
    // Exact match for the root, prefix match elsewhere, so a nested
    // route keeps its section highlighted.
    const isActive =
      item.href === '/'
        ? pathname === '/'
        : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200',
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
      {/* Sidebar */}
      <div className="w-14 bg-card rounded-xl z-50 m-2 flex flex-col items-center gap-3 py-2 shrink-0">
        {/* Logo at top */}
        <Link href="/" className="w-full flex items-center justify-center pt-2" aria-label="WallDesk home">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <div className="w-6 h-6 bg-primary-foreground rounded-full" />
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

      {/* Main Content Area — also the scroll root for infinite scroll. */}
      <div className="flex-1 my-2 mr-2 overflow-auto" {...{ [SCROLL_CONTAINER_ATTR]: true }}>
        <div className=" ml-1 p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
