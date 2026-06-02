import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://wassha-saccos.lovable.app";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Only public, indexable routes belong in the sitemap.
        // Authenticated routes (dashboard, loans, statements, profile, notifications,
        // approvals, admin/*) are blocked in robots.txt and intentionally omitted here.
        const entries = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/workflow", changefreq: "monthly", priority: "0.8" },
          { path: "/auth", changefreq: "yearly", priority: "0.5" },
        ];
        const urls = entries.map((e) =>
          `  <url>\n    <loc>${BASE_URL}${e.path}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
        );
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
