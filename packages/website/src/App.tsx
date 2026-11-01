import { ThemeProvider } from "@/hooks/use-theme";
import { usePageHead } from "@/i18n/context";
import { Header } from "@/components/header";
import { HomePage } from "@/components/home/home-page";
import { AboutPage, AgentsPage, ChecksPage, ConsultancyPage, ScanPage, SecurityPage, ToolsPage } from "@/components/pages/offer-pages";
import { Footer } from "@/components/footer";
import { NineWaysArticle } from "@/components/pages/nine-ways-article";
import { HierarchyOfAgentTrustArticle } from "@/components/pages/hierarchy-of-agent-trust-article";
import { TrustRadarPage } from "@/components/pages/trust-radar-page";
import { SelfCheckPage } from "@/components/pages/self-check-page";
import { X402CheckPage } from "@/components/pages/x402-check-page";
import { CraCheckPage } from "@/components/pages/cra-check-page";
import { DeepScanTermsPage, PrivacyPage, SignalLogPage, TermsPage } from "@/components/pages/legal-page";
import { DeepScanPage, DeepScanStatusPage } from "@/components/pages/deep-scan-page";
import { ScoreboardPage } from "@/components/pages/scoreboard-page";
import { BlogIndex, NotesIndex } from "@/components/pages/notes-index";
import { ZeroOf600Article } from "@/components/pages/zero-of-600-article";
import { ReceiptCannotNameArticle } from "@/components/pages/receipt-cannot-name-article";
import { RevocationsArticle } from "@/components/pages/revocations-article";
import { BlogPostPage } from "@/components/blog/blog-post-page";
import { findPostByPath } from "@/data/blog-posts";
import { parsePath } from "@/lib/locale-paths";

// De pagina's per slug. Het taalvoorvoegsel (/nl, of het oude /en) wordt eraf gehaald voor de opzoeking
// (lib/locale-paths.ts), dus elke slug is in beide talen bereikbaar; stukken zonder vertaling tonen hun Engelse tekst.
const ARTICLES: Record<string, () => JSX.Element> = {
  "/notes": NotesIndex,
  // The blog and the notes are two places. A blog is only what the owner has called one.
  "/blog": BlogIndex,
  "/notes/a-signed-receipt-that-cannot-name-its-own-payment": ReceiptCannotNameArticle,
  "/notes/733203-attestations-were-taken-back": RevocationsArticle,
  "/notes/zero-of-600-x402-services-sign-a-receipt": ZeroOf600Article,
  "/notes/nine-ways-to-fake-a-delivery-claim": NineWaysArticle,
  "/notes/the-hierarchy-of-agent-trust": HierarchyOfAgentTrustArticle,
  "/trust-radar": TrustRadarPage,
  "/check": SelfCheckPage,
  "/x402-check": X402CheckPage,
  "/cra-check": CraCheckPage,
  "/signal-log": SignalLogPage,
  "/terms": TermsPage,
  "/privacy": PrivacyPage,
  "/scoreboard": ScoreboardPage,
  "/checks": ChecksPage,
  "/security": SecurityPage,
  "/scan": ScanPage,
  "/tools": ToolsPage,
  "/agents": AgentsPage,
  "/deep-scan": DeepScanPage,
  "/scan/status": DeepScanStatusPage,
  "/deep-scan-terms": DeepScanTermsPage,
  "/consultancy": ConsultancyPage,
  "/about": AboutPage,
};

function articleForPath(path: string): (() => JSX.Element) | null {
  const withoutLocale = parsePath(path).rest;
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
  usePageHead(ArticleComponent !== null);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main>
          {ArticleComponent ? (
            <ArticleComponent />
          ) : (
            <HomePage />
          )}
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}
