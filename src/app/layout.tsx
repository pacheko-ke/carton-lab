import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CartonLab Lightweight 2.0",
  description: "Design, preview, and export carton keylines.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
