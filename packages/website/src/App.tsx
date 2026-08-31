import { ThemeProvider } from "@/hooks/use-theme";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { WhyNow } from "@/components/sections/why-now";
import { Product } from "@/components/sections/product";
import { HowItWorks } from "@/components/sections/how-it-works";
import { HalalLine } from "@/components/sections/halal-line";
import { OpenSource } from "@/components/sections/open-source";
import { Status } from "@/components/sections/status";

export default function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main>
          <Hero />
          <Problem />
          <WhyNow />
          <Product />
          <HowItWorks />
          <HalalLine />
          <OpenSource />
          <Status />
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}
