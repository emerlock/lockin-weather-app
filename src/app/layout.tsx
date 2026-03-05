import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
  title: "LockIn Weather",
  description: "Next.js weather scaffold with API routes, Zustand, and Headless UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => {
            try {
              const stored = localStorage.getItem("weather.theme");
              const isDark = stored !== "light";
              const root = document.documentElement;
              root.classList.toggle("dark", isDark);
              root.style.colorScheme = isDark ? "dark" : "light";
            } catch {
              document.documentElement.classList.add("dark");
              document.documentElement.style.colorScheme = "dark";
            }
          })();`}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
