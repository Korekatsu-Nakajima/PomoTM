import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  output: "export",
  allowedDevOrigins: ["192.168.56.1", "localhost:3000"],
};

export default nextConfig;
