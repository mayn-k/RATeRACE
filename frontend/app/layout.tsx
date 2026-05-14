import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RATe RACE — SOOT Scatter Gallery',
  description: 'Rate your AI exposure. Know your worth.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Anonymous+Pro:wght@400;700&family=Pixelify+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
