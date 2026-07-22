import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
