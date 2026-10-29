import { useEffect } from "react";

import { CheckScene, Hero, MissionScene, OfferTiles, PillarScene, SecurityScene, TalkScene, Unknowns } from "@/components/home/home-sections";
import { CINEMA } from "@/data/home-copy";
import { useLocale } from "@/i18n/context";

// The sections of the old homepage now live on the tools page. A link from outside to one of them (tokenizen.nl/#hoe-het-werkt) would land on
// the top of the new homepage; this sends it to the same section on the tools page.
const LEGACY_ANCHORS = ["probleem", "waarom-nu", "product", "controle", "hoe-het-werkt", "ontwerpgrenzen", "open-source", "status"];

export function legacyAnchorTarget(hash: string, locale: "en" | "nl"): string | null {
  const id = hash.replace(/^#/, "");
  if (!LEGACY_ANCHORS.includes(id)) return null;
  return `${locale === "nl" ? "" : "/en"}/tools#${id}`;
}

// The photograph behind each pillar, in the order of the pillars. Left and right alternate so the eye moves down the page.
const PILLAR_STAGE = [
  { image: "kluis", side: "left" },
  { image: "techniek", side: "right" },
  { image: "uniek", side: "left" },
] as const;

/** The homepage, one screen at a time: what we do, the three pillars, security, mission and vision, the free check, the misses, a conversation. */
export function HomePage() {
  const { locale } = useLocale();
  const loc = locale === "nl" ? "nl" : "en";

  useEffect(() => {
    const target = legacyAnchorTarget(window.location.hash, loc);
    if (target) window.location.replace(target);
  }, [loc]);

  return (
    <div className="cinema">
      <Hero locale={loc} />
      <OfferTiles locale={loc} />
      {CINEMA[loc].pillars.map((pillar, i) => (
        <PillarScene key={pillar.id} pillar={pillar} image={PILLAR_STAGE[i].image} side={PILLAR_STAGE[i].side} />
      ))}
      <SecurityScene locale={loc} />
      <MissionScene locale={loc} />
      <CheckScene locale={loc} />
      <Unknowns locale={loc} />
      <TalkScene locale={loc} />
    </div>
  );
}
