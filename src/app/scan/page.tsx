import type { Metadata } from "next";
import type { WebApplication, WithContext } from "schema-dts";
import { Footer } from "@/components/home/footer";
import { Header } from "@/components/home/header";
import { JsonLd } from "@/components/json-ld";
import { QuickScan } from "@/components/quick-scan";
import { env } from "@/lib/env";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free US visa Case Scan for Ghanaians",
  description:
    "Answer a few questions and see where a US consular officer in Accra is likely to press, the questions you'll probably get, and exactly what to bring. Free, instant, no signup.",
  alternates: { canonical: "/scan" },
};

const ld: WithContext<WebApplication> = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Okwan Case Scan",
  url: `${site.url}/scan`,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  isAccessibleForFree: true,
  inLanguage: site.lang,
  description: "Free check of a US F-1 or B1/B2 visa case: likely pressure points, likely questions and a document checklist.",
  publisher: { "@id": `${site.url}/#organization` },
};

export default function ScanPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-16">
        <p className="label text-muted">Free · no signup</p>
        <h1 className="font-display mt-3 max-w-4xl text-[clamp(2.6rem,6vw,5.2rem)] uppercase leading-[0.95]">
          Where will the officer press?
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          A few answers about your case, and you&rsquo;ll see the weak points an officer in Accra will look for, the questions
          you&rsquo;re likely to get, and what to bring. No approval odds, ever: nobody can honestly give you those.
        </p>
        <div className="mt-10">
          <QuickScan signedIn={false} ghsPerUsd={env.fxGhsPerUsd} />
        </div>
      </main>
      <Footer />
      <JsonLd data={[ld]} />
    </>
  );
}
