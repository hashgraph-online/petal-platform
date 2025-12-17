import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto_Mono } from "next/font/google";
import Navbar from "@/components/site/navbar";
import Footer from "@/components/site/footer";
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

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL &&
      !process.env.NEXT_PUBLIC_APP_URL.includes("localhost")
      ? process.env.NEXT_PUBLIC_APP_URL
      : "https://petals.hol.org",
  ),
  title: "HOL Petal Platform",
  description:
    "HOL-built Hedera dApp for profiles, petals, and messaging.",
  openGraph: {
    title: "HOL Petal Platform",
    description: "HOL-built Hedera dApp for profiles, petals, and messaging.",
    type: "website",
    images: [
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: "HOL Petal Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HOL Petal Platform",
    description: "HOL-built Hedera dApp for profiles, petals, and messaging.",
    images: ["/og-card.png"],
    creator: "@HashgraphOnline",
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    apple: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${robotoMono.variable} antialiased transition-colors duration-300 bg-brand-white text-brand-dark dark:bg-gray-950 dark:text-brand-white`}
      >
        <AppProviders>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
              {children}
            </main>
            <Footer />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
