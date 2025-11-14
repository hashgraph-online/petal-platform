import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { MainNav } from "@/components/navigation/main-nav";
import { HeaderControls } from "@/components/header/HeaderControls";
import { AppProviders } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const navItems = [
  { href: "/profile", label: "Profile" },
  { href: "/petals", label: "Petals" },
  { href: "/messages", label: "Messages" },
  { href: "/flora", label: "Floras" },
];

export const metadata: Metadata = {
  title: "Petal Platform",
  description:
    "Hedera dApp for profiles, petals, messaging, and flora coordination.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-slate-50 text-slate-900 antialiased`}
      >
        <AppProviders>
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-slate-200 bg-white">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
                <Link href="/" className="text-lg font-semibold tracking-tight">
                  Petal Platform
                </Link>
                <MainNav items={navItems} />
                <HeaderControls />
              </div>
            </header>
            <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
              {children}
            </main>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
