import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";

const appSans = Noto_Sans({
  variable: "--font-app-sans",
  subsets: ["vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const appMono = Geist_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TCM",
  description: "TCM - Cổng xác thực bảo mật sử dụng Supabase Auth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${appSans.variable} ${appMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
