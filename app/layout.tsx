import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "뚜레 협동작전",
  description: "니케 협동작전 모집 사이트",
  openGraph: {
    title: "뚜레 협동작전",
    description: "니케 협동작전 모집 사이트",
    images: ["/og.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "뚜레 협동작전",
    description: "니케 협동작전 모집 사이트",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}