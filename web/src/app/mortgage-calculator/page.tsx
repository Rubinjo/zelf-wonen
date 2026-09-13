import type { Metadata } from "next";
import { MortgageCalculator } from "@/components/mortgage/mortgage-calculator";
import { getLanguage } from "@/lib/language";

export async function generateMetadata(): Promise<Metadata> {
    const lang = await getLanguage();
    return lang === "en"
        ? {
              title: "Calculate your maximum mortgage",
              description:
                  "Calculate your maximum mortgage and affordability based on your income, energy label, student debt and other obligations — following Nibud and NHG standards.",
          }
        : {
              title: "Maximale hypotheek berekenen",
              description:
                  "Bereken je maximale hypotheek en betaalbaarheid op basis van je inkomen, energielabel, studieschuld en overige verplichtingen — volgens de Nibud- en NHG-normen.",
          };
}

export default function MortgageCalculatorPage() {
    return <MortgageCalculator />;
}
