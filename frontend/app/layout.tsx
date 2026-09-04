import type { Metadata } from "next";
import "./globals.css";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins-next",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Audrolics",
  description: "Audrolics: your web-based automated calculation and condition monitoring system for pressurized water pipe networks.",
  icons: {
    icon: "../public/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${poppins.variable}`}>
        {children}
      </body>
    </html>
  );
}
