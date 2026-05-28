import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "语见 | Yujian",
  description: "平静而优雅的韩语学习空间。为中文母语者设计，专注于词源洞察与细腻的阅读体验。",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
