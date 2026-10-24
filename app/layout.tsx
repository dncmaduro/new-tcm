import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import "@mantine/core/styles.css";
import { Providers } from "@/components/providers";
import { getSiteMetadata } from "@/lib/seo";
import "./globals.css";

const appSans = Be_Vietnam_Pro({
  variable: "--font-app-sans",
  subsets: ["vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const appMono = Geist_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = getSiteMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${appSans.variable} ${appMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
