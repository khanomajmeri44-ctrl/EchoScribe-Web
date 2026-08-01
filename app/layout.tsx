import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const scheme = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${scheme}://${host}`;
  const title = "EchoScribe · Private English transcription";
  const description = "Transcribe English audio locally in your browser with the lightweight tiny.en model.";
  return {
    title,
    description,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/favicon.ico", shortcut: "/favicon.ico" },
    openGraph: { title, description, type: "website", images: [`${origin}/og.png`] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><title>EchoScribe · Private English transcription</title></head>
      <body>{children}</body>
    </html>
  );
}
