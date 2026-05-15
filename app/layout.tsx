import type { Metadata } from "next";
import { Geist_Mono, Quicksand } from "next/font/google";
import "@mantine/core/styles.css";
import { Providers } from "@/components/providers";
import { getSiteMetadata } from "@/lib/seo";
import "./globals.css";

const appSans = Quicksand({
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
