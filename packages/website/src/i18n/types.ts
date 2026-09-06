export interface NavLink {
  href: string;
  label: string;
}

export interface CardText {
  title: string;
  body: string;
}

export interface Dictionary {
  htmlLang: string;
  meta: {
    title: string;
    description: string;
    ogLocale: string;
    ogTitle: string;
    ogDescription: string;
    twitterTitle: string;
    twitterDescription: string;
  };
  header: {
    navLabel: string;
    mobileNavLabel: string;
    links: NavLink[];
    github: string;
    openMenu: string;
    closeMenu: string;
  };
  languageSwitch: {
    groupLabel: string;
    nl: string;
    en: string;
  };
  themeToggle: {
    groupLabel: string;
    light: string;
    system: string;
    dark: string;
  };
  hero: {
    eyebrow: string;
    h1Line1: string;
    h1Line2: string;
    body: string;
    trustLine: string;
    ctaPrimary: string;
    ctaSecondary: string;
    installLabel: string;
  };
  problem: {
    eyebrow: string;
    h2: string;
    body: string;
    cards: CardText[];
  };
  whyNow: {
    eyebrow: string;
    h2: string;
    body: string;
    reasons: Array<{ date: string; title: string; body: string }>;
  };
  product: {
    eyebrow: string;
    h2: string;
    body: string;
    codeLabelRecordCall: string;
    codeLabelHistoryCall: string;
    codeLabelResult: string;
    note: string;
    cards: CardText[];
  };
  howItWorks: {
    eyebrow: string;
    h2: string;
    body: string;
    steps: CardText[];
  };
  boundaries: {
    eyebrow: string;
    h2: string;
    body: string;
    columns: Array<{ label: string; items: string[] }>;
  };
  openSource: {
    eyebrow: string;
    h2: string;
    body: string;
    badges: { mit: string; typescript: string; mcp: string; status: string };
    npmLabel: string;
    installIntro: string;
    localDevLabel: string;
    repoButton: string;
    terminalLabel: string;
    localTerminalLabel: string;
    commentBuild: string;
    commentTest: string;
    commentDemo: string;
    copyLabel: string;
    copiedLabel: string;
  };
  status: {
    eyebrow: string;
    h2: string;
    body: string;
    checkpoints: Array<CardText & { achieved: boolean }>;
    proof: {
      title: string;
      body: string;
      txLabel: string;
      verificationLabel: string;
    };
  };
  footer: {
    tagline: string;
    githubLabel: string;
    copyright: string;
    legend: Array<{ dot: string; label: string }>;
  };
  noscript: {
    h1: string;
    body: string;
    h2: string;
    productBody: string;
    link: string;
  };
}
