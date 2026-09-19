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

const ARTICLE_SLUG = "/notes/nine-ways-to-fake-a-delivery-claim";

export default function App() {
  // Engelstalig-only stuk: geen NL-versie. De taalwissel-knop in de header
  // bouwt zijn href door het /en-voorvoegsel te strippen (i18n/context.tsx),
  // dus zonder deze tweede match valt die knop hier stil terug op de
  // homepage in plaats van het artikel te tonen.
  const path = window.location.pathname;
  const isArticle = path === `/en${ARTICLE_SLUG}` || path === ARTICLE_SLUG;

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main>
          {isArticle ? (
            <NineWaysArticle />
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
