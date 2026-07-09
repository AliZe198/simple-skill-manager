import type { Metadata } from "next";
import { Nunito, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/components/LangProvider";
import { ToastProvider } from "@/components/Toast";
import { Sidebar } from "@/components/Sidebar";
import { SafetyBanner } from "@/components/SafetyBanner";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-nunito",
});
const noto = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto",
});

export const metadata: Metadata = {
  title: "Skill Manager",
  description: "Corral skills across your AI tools",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${nunito.variable} ${noto.variable}`}>
      <body>
        <LangProvider>
          <ToastProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex flex-1 flex-col overflow-hidden">
                <SafetyBanner />
                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
                </div>
              </main>
            </div>
          </ToastProvider>
        </LangProvider>
      </body>
    </html>
  );
}
