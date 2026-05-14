import type { Metadata } from 'next';
import { IMAGEKIT_URL, SCATTER_PRIORITY, SCATTER_TR } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: 'RATe RACE — SOOT Scatter Gallery',
  description: 'Rate your AI exposure. Know your worth.',
};

// Priority images from scatter-gallery.js — preload these before any JS runs.
const priorityPreloads = IMAGEKIT_URL
  ? [...SCATTER_PRIORITY].map(
      (n) =>
        `${IMAGEKIT_URL}/tr:${SCATTER_TR}/scatter-images/image${n}.png`,
    )
  : [];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Establish CDN connection before any image requests */}
        {IMAGEKIT_URL && (
          <>
            <link rel="preconnect" href="https://ik.imagekit.io" crossOrigin="anonymous" />
            <link rel="dns-prefetch" href="https://ik.imagekit.io" />
          </>
        )}

        {/* Preload the 8 priority scatter images that appear first */}
        {priorityPreloads.map((href) => (
          <link key={href} rel="preload" as="image" href={href} />
        ))}

        <link
          href="https://fonts.googleapis.com/css2?family=Anonymous+Pro:wght@400;700&family=Pixelify+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
