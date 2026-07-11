import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand-assets";
import { AppSettingsProvider } from "@/lib/AppSettingsProvider";
import { getSiteUrl } from "@/lib/site-url";
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
  metadataBase: getSiteUrl(),
  applicationName: "LenguaRiver",
  title: {
    default: "LenguaRiver",
    template: "%s · LenguaRiver",
  },
  description: "A simple language learning platform with structured lessons.",
  icons: {
    icon: [
      { url: BRAND.iconMark, sizes: "32x32", type: "image/png" },
      { url: BRAND.iconMark, sizes: "64x64", type: "image/png" },
      { url: BRAND.iconMark, sizes: "192x192", type: "image/png" },
      { url: BRAND.iconMark, sizes: "512x512", type: "image/png" },
      { url: BRAND.iconMark, sizes: "1024x1024", type: "image/png" },
    ],
    apple: [{ url: BRAND.iconMark, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "LenguaRiver",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "LenguaRiver",
    title: "LenguaRiver",
    description: "Structured language lessons.",
    images: [
      {
        url: BRAND.logoFullLight,
        width: 1200,
        height: 400,
        alt: "LenguaRiver logo featuring a mountain and a river of multilingual greetings with the brand name.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LenguaRiver",
    description: "Structured language lessons.",
    images: [BRAND.logoFullLight],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0f12" },
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {/* Runs before React hydration to prevent flash of wrong theme */}
        <Script
          id="lenguariver-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('lenguariver_settings')||'{}');if(s.theme==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`,
          }}
        />
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
