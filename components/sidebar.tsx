"use client"
import React, { useState } from 'react';
import { Home, Search, Palette, User, MessageSquare, Bell } from 'lucide-react';

export default function Sidebar({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [activeItem, setActiveItem] = useState('home');

  const menuItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'palette', icon: Palette, label: 'Palette' },
    { id: 'user', icon: User, label: 'User' },
    { id: 'messages', icon: MessageSquare, label: 'Messages' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
  ];

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar */}
      <div className="w-14 bg-card rounded-xl m-2 flex flex-col items-center gap-3 py-2 shrink-0">
        {/* Logo at top */}
        <div className="w-full flex items-center justify-center pt-2">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <div className="w-6 h-6 bg-primary-foreground rounded-full" />
          </div>  
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isActive 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-transparent text-primary hover:text-primary hover:bg-card'
              }`}
              aria-label={item.label}
            >
              <Icon size={18} strokeWidth={2} />
            </button>
          );
          })}
        </div>
        
        {/* spacer / bottom */}
        <div className="h-2" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 my-2 mr-2 overflow-auto">
        <div className=" ml-1 p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
