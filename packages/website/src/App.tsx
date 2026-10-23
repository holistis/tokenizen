import { ThemeProvider } from "@/hooks/use-theme";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { WhyNow } from "@/components/sections/why-now";
import { Product } from "@/components/sections/product";
import { SecondPillar } from "@/components/sections/second-pillar";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Boundaries } from "@/components/sections/boundaries";
import { OpenSource } from "@/components/sections/open-source";
import { Status } from "@/components/sections/status";
import { NineWaysArticle } from "@/components/pages/nine-ways-article";
import { HierarchyOfAgentTrustArticle } from "@/components/pages/hierarchy-of-agent-trust-article";
import { TrustRadarPage } from "@/components/pages/trust-radar-page";
import { SelfCheckPage } from "@/components/pages/self-check-page";
import { NotesIndex } from "@/components/pages/notes-index";
import { ZeroOf600Article } from "@/components/pages/zero-of-600-article";
import { ReceiptCannotNameArticle } from "@/components/pages/receipt-cannot-name-article";
import { RevocationsArticle } from "@/components/pages/revocations-article";
import { BlogPostPage } from "@/components/blog/blog-post-page";
import { findPostByPath } from "@/data/blog-posts";

// Engelstalig-only stukken: geen NL-versie. De taalwissel-knop in de header
// bouwt zijn href door het /en-voorvoegsel te strippen (i18n/context.tsx),
// dus zonder de tweede match per slug valt die knop hier stil terug op de
// homepage in plaats van het artikel te tonen.
const ARTICLES: Record<string, () => JSX.Element> = {
  "/notes": NotesIndex,
  // The blog and the notes are one place. /blog is the name people will guess.
  "/blog": NotesIndex,
  "/notes/a-signed-receipt-that-cannot-name-its-own-payment": ReceiptCannotNameArticle,
  "/notes/733203-attestations-were-taken-back": RevocationsArticle,
  "/notes/zero-of-600-x402-services-sign-a-receipt": ZeroOf600Article,
  "/notes/nine-ways-to-fake-a-delivery-claim": NineWaysArticle,
  "/notes/the-hierarchy-of-agent-trust": HierarchyOfAgentTrustArticle,
  "/trust-radar": TrustRadarPage,
  "/check": SelfCheckPage,
};

function articleForPath(path: string): (() => JSX.Element) | null {
  const withoutLocale = path === "/en" || path.startsWith("/en/") ? path.slice(3) : path;
  // A trailing slash is the same page. Without this /notes/ fell through to the homepage.
  const slug = withoutLocale.replace(/\/+$/, "");
  const fixed = ARTICLES[slug];
  if (fixed) return fixed;
  // Posts that are data in blog-posts.ts get their route from their slug.
  const post = findPostByPath(slug);
  return post ? () => <BlogPostPage post={post} /> : null;
}

export default function App() {
  const ArticleComponent = articleForPath(window.location.pathname);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main>
          {ArticleComponent ? (
            <ArticleComponent />
          ) : (
            <>
              <Hero />
              <Problem />
              <WhyNow />
              <Product />
              <SecondPillar />
              <HowItWorks />
              <Boundaries />
              <OpenSource />
              <Status />
            </>
          )}
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}
