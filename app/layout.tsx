import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Roboto, Roboto_Mono } from "next/font/google";
import { MainNav } from "@/components/navigation/main-nav";
import { HeaderControls } from "@/components/header/HeaderControls";
import { AppProviders } from "./providers";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const navItems = [
  { href: "/profile", label: "Profile" },
  { href: "/petals", label: "Petals" },
  { href: "/messages", label: "Messages" },
];

export const metadata: Metadata = {
  title: "HOL Petal Platform",
  description:
    "HOL-built Hedera dApp for profiles, petals, and messaging.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${robotoMono.variable} antialiased`}
      >
        <AppProviders>
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-holNavy/25 bg-[rgba(18,24,54,0.85)] backdrop-blur shadow-lg">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
                <Link
                  href="/"
                  className="flex items-center gap-3 text-lg font-semibold tracking-tight text-holNavy"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-holBlue/50 bg-[rgba(18,24,54,0.95)]">
                    <Image src="/logo.png" alt="HOL logo" width={40} height={40} priority />
                  </span>
                  <span>Petal Platform</span>
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
