import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * Search and AI-answer crawlers are explicitly welcome (docs/PLAN.md §6.1).
 * Training crawlers are allowed too: brand recall inside models is worth more
 * to us than the content. Private app routes are excluded for everyone.
 */
const privatePaths = ["/api/", "/app", "/admin", "/expert/", "/login", "/forgot", "/setup", "/auth/", "/share/"];

const answerBots = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
];
const trainingBots = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      { userAgent: answerBots, allow: "/", disallow: privatePaths },
      { userAgent: trainingBots, allow: "/", disallow: privatePaths },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
