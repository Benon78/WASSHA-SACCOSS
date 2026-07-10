export const SITE_URL = "https://wassha-saccos.lovable.app";

export function pageHead(opts: {
  path: string;
  title: string;
  description: string;
  noIndex?: boolean;
}) {
  const url = `${SITE_URL}${opts.path}`;
  const meta = [
    { title: opts.title },
    { name: "description", content: opts.description },
    { property: "og:title", content: opts.title },
    { property: "og:description", content: opts.description },
    { property: "og:url", content: url },
    { name: "twitter:title", content: opts.title },
    { name: "twitter:description", content: opts.description },
  ];
  if (opts.noIndex) meta.push({ name: "robots", content: "noindex, nofollow" } as any);
  return {
    meta,
    links: [{ rel: "canonical", href: url }],
  };
}
