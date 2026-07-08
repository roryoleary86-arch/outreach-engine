import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outreach Engine",
  description: "Personalized B2B email research and drafting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
