import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "뚜레의 오븐 협동작전",
  description: "뚜레 협동작전 사이트",
  openGraph: {
    title: "뚜레의 오븐 협동작전",
    description: "뚜레 협동작전 사이트",
    images: ["/toast.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "뚜레의 오븐 협동작전",
    description: "뚜레 협동작전 사이트",
    images: ["/toast.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}