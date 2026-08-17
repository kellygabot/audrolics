import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audrolics",
  description: "Audrolics: your web-based automated calculation and condition monitoring system for pressurized water pipe networks.",
};

export default function RootLayout({children,}: Readonly <{
  children: React.ReactNode; }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
