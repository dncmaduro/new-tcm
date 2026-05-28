import type { MetadataRoute } from "next";
import { getSiteUrl, isProductionIndexingEnabled, PUBLIC_SITEMAP_PATHS } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionIndexingEnabled()) {
    return [];
  }

  const siteUrl = getSiteUrl();
  const updatedAt = new Date();

  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    lastModified: updatedAt,
    changeFrequency: path === "/" ? "weekly" : "daily",
    priority: path === "/" ? 1 : 0.7,
  }));
}
