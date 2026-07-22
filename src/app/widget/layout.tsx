import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full w-full overflow-hidden">
      <head>
        <style>{`
          html, body {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            touch-action: manipulation;
            -webkit-text-size-adjust: 100%;
          }
        `}</style>
      </head>
      <body className="h-full w-full overflow-hidden bg-transparent antialiased">
        {children}
      </body>
    </html>
  );
}
