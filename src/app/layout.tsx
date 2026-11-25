import type { Metadata } from "next";
import Script from "next/script";
import InspectionGuard from "./inspection-guard";
import ThemeProvider from "./theme-provider";
import ToastProvider from "./toast-provider";
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
    <html lang="en" className="h-full" data-theme="dark" suppressHydrationWarning>
      <body className="h-full">
        <Script id="packstudio-theme-init" strategy="beforeInteractive">
          {`try {
  const savedTheme = localStorage.getItem("packstudio-theme");
  const theme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : "dark";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
} catch {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}`}
        </Script>
        <InspectionGuard />
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
