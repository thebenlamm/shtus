import type { NextConfig } from "next";

// Validate PartyKit host in production
// Trim whitespace to prevent CSP header corruption from trailing newlines in env vars
const partykitHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST?.trim();
const isDev = process.env.NODE_ENV === "development";

if (!isDev && !partykitHost) {
  console.warn(
    "Warning: NEXT_PUBLIC_PARTYKIT_HOST is not set. PartyKit connections will fail in production."
  );
}

const nextConfig: NextConfig = {
  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevent clickjacking
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Prevent MIME type sniffing
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Control referrer information
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Prevent XSS attacks (modern browsers)
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // DNS prefetch control
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          // Permissions policy - restrict sensitive APIs
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Content Security Policy
          // Note: 'unsafe-inline' is needed for Next.js style tags and the theme script.
          // The theme script is minimal and doesn't execute external code.
          // For stricter CSP, consider moving theme detection to a separate script with a hash.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Allow scripts from self and inline (needed for Next.js and theme script)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Allow styles from self and inline (needed for Tailwind/Next.js)
              "style-src 'self' 'unsafe-inline'",
              // Allow images from self and data URIs
              "img-src 'self' data: blob:",
              // Allow fonts from self and Google Fonts
              "font-src 'self' https://fonts.gstatic.com",
              // Allow connections to self and PartyKit
              `connect-src 'self' ${partykitHost ? `wss://${partykitHost} https://${partykitHost}` : ""} ws://localhost:* wss://localhost:*`,
              // Allow form submissions to self
              "form-action 'self'",
              // Prevent embedding in frames
              "frame-ancestors 'none'",
              // Base URI restriction
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
