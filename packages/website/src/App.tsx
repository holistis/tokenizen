import { ThemeProvider } from "@/hooks/use-theme";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { WhyNow } from "@/components/sections/why-now";
import { Product } from "@/components/sections/product";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Boundaries } from "@/components/sections/boundaries";
import { OpenSource } from "@/components/sections/open-source";
import { Status } from "@/components/sections/status";
import { NineWaysArticle } from "@/components/pages/nine-ways-article";
import { HierarchyOfAgentTrustArticle } from "@/components/pages/hierarchy-of-agent-trust-article";
import { TrustRadarPage } from "@/components/pages/trust-radar-page";
import { SelfCheckPage } from "@/components/pages/self-check-page";

// Engelstalig-only stukken: geen NL-versie. De taalwissel-knop in de header
// bouwt zijn href door het /en-voorvoegsel te strippen (i18n/context.tsx),
// dus zonder de tweede match per slug valt die knop hier stil terug op de
// homepage in plaats van het artikel te tonen.
const ARTICLES: Record<string, () => JSX.Element> = {
  "/notes/nine-ways-to-fake-a-delivery-claim": NineWaysArticle,
  "/notes/the-hierarchy-of-agent-trust": HierarchyOfAgentTrustArticle,
  "/trust-radar": TrustRadarPage,
  "/check": SelfCheckPage,
};

function articleForPath(path: string): (() => JSX.Element) | null {
  const slug = path.startsWith("/en") ? path.slice(3) : path;
  return ARTICLES[slug] ?? null;
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
