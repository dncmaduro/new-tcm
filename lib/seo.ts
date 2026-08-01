import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

const SITE_NAME = "TCM";
const LOGIN_DESCRIPTION =
  "Đăng nhập vào TCM để theo dõi goal, task, chấm công, báo cáo và hiệu suất nội bộ.";
const DEFAULT_KEYWORDS = [
  "TCM",
  "quản lý nội bộ",
  "quản lý goal",
  "quản lý task",
  "chấm công",
  "báo cáo hiệu suất",
];
const FALLBACK_BASE_URL = "http://localhost:3000";
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;
const PRODUCTION_ENV_VALUES = new Set(["prod", "production"]);

export const PUBLIC_SITEMAP_PATHS = ["/", "/forgot-password"] as const;

type BuildPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
};

export function getSiteUrl() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!rawUrl) {
    return new URL(FALLBACK_BASE_URL);
  }

  return new URL(ABSOLUTE_URL_PATTERN.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  );
}

export function isProductionIndexingEnabled() {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv && vercelEnv !== "production") {
    return false;
  }

  const appEnv = process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (appEnv && !PRODUCTION_ENV_VALUES.has(appEnv)) {
    return false;
  }

  return !isLocalHostname(getSiteUrl().hostname);
}

export function isPublicIndexablePath(path: string) {
  return PUBLIC_SITEMAP_PATHS.includes(path as (typeof PUBLIC_SITEMAP_PATHS)[number]);
}

function buildRobots(allowIndex: boolean) {
  if (!allowIndex) {
    return {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large" as const,
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  };
}

export function createMetadataSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function joinTitleSegments(...segments: Array<string | null | undefined>) {
  return segments
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .join(" | ");
}

export function getSiteMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  const robots = buildRobots(isProductionIndexingEnabled() && isPublicIndexablePath("/"));

  return {
    metadataBase: siteUrl,
    applicationName: SITE_NAME,
    title: {
      default: `Đăng nhập | ${SITE_NAME}`,
      template: `%s | ${SITE_NAME}`,
    },
    description: LOGIN_DESCRIPTION,
    keywords: DEFAULT_KEYWORDS,
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "business",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon.png", type: "image/png", sizes: "512x512" },
      ],
      shortcut: ["/favicon.ico"],
      apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
    },
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: `Đăng nhập | ${SITE_NAME}`,
      description: LOGIN_DESCRIPTION,
      url: siteUrl,
      siteName: SITE_NAME,
      locale: "vi_VN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `Đăng nhập | ${SITE_NAME}`,
      description: LOGIN_DESCRIPTION,
    },
    robots,
  };
}

export function buildPageMetadata({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
}: BuildPageMetadataOptions): Metadata {
  const canonicalUrl = new URL(path, getSiteUrl());
  const pageKeywords = Array.from(new Set([...DEFAULT_KEYWORDS, ...keywords]));
  const robots = buildRobots(
    !noIndex && isProductionIndexingEnabled() && isPublicIndexablePath(path),
  );

  return {
    title,
    description,
    keywords: pageKeywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: "vi_VN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
    robots,
  };
}
