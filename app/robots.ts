import type { MetadataRoute } from "next";
import { getSiteUrl, isProductionIndexingEnabled } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  const canIndex = isProductionIndexingEnabled();

  return {
    rules: canIndex
      ? {
          userAgent: "*",
          allow: "/",
        }
      : {
          userAgent: "*",
          disallow: "/",
        },
    sitemap: canIndex ? new URL("/sitemap.xml", siteUrl).toString() : undefined,
    host: siteUrl.toString(),
  };
}
