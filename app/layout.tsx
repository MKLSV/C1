import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Компас — профориентация через разговор",
  description:
    "AI-собеседник, который помогает найти конкретное дело по душе и понять, на чём зарабатывать.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
