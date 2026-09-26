import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One account is one applicant, so case pages live at /app/… without the case id.
  // Old links (emails, bookmarks) still land in the right place.
  async redirects() {
    return [
      { source: "/app/cases/:id", destination: "/app", permanent: true },
      { source: "/app/cases/:id/:path*", destination: "/app/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
