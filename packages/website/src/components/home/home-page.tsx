import { useEffect } from "react";

import { Altitude, AltitudeRail, ALTITUDES } from "@/components/matrix/altitude";
import { HeroAltimeter } from "@/components/home/hero-altimeter";
import { OfferMatrix } from "@/components/home/offer-matrix";
import { Brothers, CheckYours, Proof, SecurityRecord, Unknowns } from "@/components/home/lower-sections";
import { useLocale } from "@/i18n/context";

// The sections of the old homepage now live on the tools page. A link from outside to one of them (tokenizen.nl/#hoe-het-werkt) would land on
// the top of the new homepage; this sends it to the same section on the tools page.
const LEGACY_ANCHORS = ["probleem", "waarom-nu", "product", "controle", "hoe-het-werkt", "ontwerpgrenzen", "open-source", "status"];

export function legacyAnchorTarget(hash: string, locale: "en" | "nl"): string | null {
  const id = hash.replace(/^#/, "");
  if (!LEGACY_ANCHORS.includes(id)) return null;
  return `${locale === "nl" ? "" : "/en"}/tools#${id}`;
}

/** The homepage: four altitudes from above downwards, then the people, the record and the misses. */
export function HomePage() {
  const { locale } = useLocale();
  const loc = locale === "nl" ? "nl" : "en";
  const [top, aanbod, nagaan, bewijs] = ALTITUDES;

  useEffect(() => {
    const target = legacyAnchorTarget(window.location.hash, loc);
    if (target) window.location.replace(target);
  }, [loc]);

  return (
    <>
      <AltitudeRail locale={loc} />
      <Altitude step={top} locale={loc} panel>
        <HeroAltimeter locale={loc} />
      </Altitude>
      <Altitude step={aanbod} locale={loc}>
        <OfferMatrix locale={loc} />
      </Altitude>
      <Altitude step={nagaan} locale={loc}>
        <CheckYours locale={loc} />
      </Altitude>
      <Altitude step={bewijs} locale={loc}>
        <Proof locale={loc} />
      </Altitude>
      <Brothers locale={loc} />
      <SecurityRecord locale={loc} />
      <Unknowns locale={loc} />
    </>
  );
}
