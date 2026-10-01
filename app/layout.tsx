
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import ShortcutBlocker from "@/components/shortcut-blocker";
import { AppContextMenu } from "@/components/common/app_context_menu";
import { PALETTE_BOOTSTRAP_SCRIPT } from "@/lib/theme";



const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WallDesk",
  description: "Browse, download, and set desktop wallpapers.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    // `suppressHydrationWarning`: both next-themes and the palette bootstrap
    // below mutate <html> before React attaches, so the server markup is
    // expected to differ here.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must run before first paint, or the window renders in the default
            palette and then repaints into the stored one. */}
        <script dangerouslySetInnerHTML={{ __html: PALETTE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          // Transitions are handled by the `.theme-switching` window in
          // globals.css instead, so light/dark cross-fades like the palette
          // switch rather than snapping.
        >
                        {/* Blocks webview-native shortcuts (Ctrl+R reload, F5, devtools)
                that have no place in a desktop window. The context menu's
                clipboard actions use `navigator.clipboard` directly, so they
                still work despite the copy/cut event suppression here. */}
            <ShortcutBlocker />
            <AppContextMenu />
            {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
