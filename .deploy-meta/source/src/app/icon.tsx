import { ImageResponse } from "next/og";

// Replaces the default Next.js favicon with the brand mark — Hostinger
// violet rounded square + white chat-square glyph — matching the
// sidebar logo in `src/components/layout/sidebar.tsx`. Next.js renders
// this at build time and auto-injects <link rel="icon"> into <head>.
//
// This route takes precedence over src/app/favicon.ico, which is the
// Next.js default and can stay on disk harmlessly (or be removed).

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 100 100"
          fill="#8b5cf6"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M50,8 C26.8,8 8,26.8 8,50 C8,59.5 11.2,68.2 16.6,75.2 L7,93 L26.3,86.8 C33.1,90.1 40.8,92 50,92 C73.2,92 92,73.2 92,50 C92,26.8 73.2,8 50,8 Z M32,52 L68,52 C68,61.94 59.94,70 50,70 C40.06,70 32,61.94 32,52 Z"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
