export interface ShareHead {
  lang: string;
  title: string;
  description: string;
  canonical: string;
  ogLocale: string;
  ogUrl: string;
  ogTitle: string;
  ogDescription: string;
  twitterTitle: string;
  twitterDescription: string;
  alternates: Array<{ hreflang: string; href: string }>;
}

export function applyHead(template: string, entry: ShareHead): string;
export function applyBody(html: string, bodyHtml: string, path: string): string;
