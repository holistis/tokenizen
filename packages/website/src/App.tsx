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

const ARTICLE_PATH = "/en/notes/nine-ways-to-fake-a-delivery-claim";

export default function App() {
  const isArticle = window.location.pathname === ARTICLE_PATH;

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
