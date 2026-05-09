import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSettingsProvider } from "@/lib/AppSettingsProvider";
import { ProgressProvider } from "./progress-store";
import { TopicProgressProvider } from "./topic-progress";
import { ClientMainChrome } from "./ClientMainChrome";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LenguaRiver",
  description: "A simple language learning platform with structured lessons.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* Runs before React hydration to prevent flash of wrong theme */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('lenguariver_settings')||'{}');if(s.theme==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AppSettingsProvider>
          <ProgressProvider>
            <TopicProgressProvider>
              <ClientMainChrome>{children}</ClientMainChrome>
            </TopicProgressProvider>
          </ProgressProvider>
        </AppSettingsProvider>
      </body>
    </html>
  );
}
