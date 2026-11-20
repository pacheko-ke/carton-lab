import type { Metadata } from "next";
import InspectionGuard from "./inspection-guard";
import "./globals.css";

export const metadata: Metadata = {
  title: "PackStudio",
  description: "Design, preview, and export carton keylines.",
  icons: {
    icon: "/packstudio-icon.png",
    apple: "/packstudio-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <InspectionGuard />
        {children}
      </body>
    </html>
  );
}
