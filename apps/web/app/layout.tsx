import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { caveat } from "~/lib/fonts";
import { GlobalProviders } from "~/providers/global";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
const qshipHero = localFont({
  src: "./fonts/QshipHero.ttf",
  variable: "--font-qship-hero",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ShipFlow — AI-assisted product delivery",
  description:
    "Feature request to PRD, engineering tasks, GitHub PRs, AI QA review, human approval, and ship — built for ChaiCode.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

import type { ReactNode } from "react";

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: "html,body{background:#020202!important;color:#fff}",
          }}
        />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta
          name="google-site-verification"
          content="0-M21tVL5Opq0r0Ibk-8iE3aISFbUUgT3npGo7Lcu9A"
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} ${qshipHero.variable} bg-(--landing-bg) text-white antialiased`}
      >
        <GlobalProviders>{children}</GlobalProviders>
      </body>
    </html>
  );
}
