import { Altitude, AltitudeRail, ALTITUDES } from "@/components/matrix/altitude";
import { HeroAltimeter } from "@/components/home/hero-altimeter";
import { OfferMatrix } from "@/components/home/offer-matrix";
import { Brothers, CheckYours, Proof, SecurityRecord, Unknowns } from "@/components/home/lower-sections";
import { useLocale } from "@/i18n/context";

/** The homepage: four altitudes from above downwards, then the people, the record and the misses. */
export function HomePage() {
  const { locale } = useLocale();
  const loc = locale === "nl" ? "nl" : "en";
  const [top, aanbod, nagaan, bewijs] = ALTITUDES;
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
