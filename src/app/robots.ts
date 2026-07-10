import type { MetadataRoute } from "next";

const SITE_URL = "https://prichat-ebf5.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login"],
        // Chat rooms are private and auth-gated — keep them out of search results.
        disallow: ["/chat"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
