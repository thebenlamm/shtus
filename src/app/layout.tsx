import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || "https://shtus.com"
  ),
  title: {
    default: "Shtus - The Party Game",
    template: "%s | Shtus",
  },
  description: "A multiplayer party game of outrageous answers. Create a room, invite friends, and see who can come up with the funniest responses!",
  keywords: ["party game", "multiplayer", "fun", "friends", "game night", "shtus"],
  authors: [{ name: "Shtus Team" }],
  openGraph: {
    title: "Shtus - The Party Game",
    description: "A multiplayer party game of outrageous answers. Create a room, invite friends, and see who can come up with the funniest responses!",
    type: "website",
    siteName: "Shtus",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shtus - The Party Game",
    description: "A multiplayer party game of outrageous answers!",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Theme initialization script - runs before React hydrates to prevent flash.
            suppressHydrationWarning on <html> is required because this script may add
            the 'dark' class before React renders, causing a class mismatch.
            Note: This inline script should ideally have a CSP hash, but Next.js
            doesn't easily support nonces for inline scripts in app router.
            The script only reads localStorage and sets a class - no external data. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){if(t==='dark')document.documentElement.classList.add('dark')}else if(matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.classList.add('dark')}}catch(e){if(matchMedia('(prefers-color-scheme:dark)').matches)document.documentElement.classList.add('dark')}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:bg-white focus:p-4 focus:z-50 focus:rounded-lg focus:shadow-lg"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
