import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Prevent webpack from bundling these — they need native Node.js runtime
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "pdfkit"],
};

export default nextConfig;
