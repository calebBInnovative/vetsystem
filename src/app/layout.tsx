import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/themes/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

// iPhone launch screens for the installed app (public/splash/, logo on white like
// the manifest's background_color). iOS picks the one whose media query matches.
const IPHONE_SPLASH: [width: number, height: number, ratio: number][] = [
  [440, 956, 3], [430, 932, 3], [402, 874, 3], [393, 852, 3], [428, 926, 3],
  [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2],
];

export const metadata: Metadata = {
  title: "VetSystem - Pet's House",
  description: "Sistema de Gestión Veterinaria",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VetSystem",
    startupImage: IPHONE_SPLASH.map(([w, h, r]) => ({
      url: `/splash/iphone-${w * r}x${h * r}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/logo.jpeg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f7d6e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Lets the installed app reach the screen edges; env(safe-area-inset-*) keeps
  // the bottom tab bar clear of the iPhone home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
