import type { Metadata } from "next";
import { MortgageCalculator } from "@/components/mortgage/mortgage-calculator";

export const metadata: Metadata = {
    title: "Maximale hypotheek berekenen",
    description:
        "Bereken je maximale hypotheek en betaalbaarheid op basis van je inkomen, energielabel, studieschuld en overige verplichtingen — volgens de Nibud- en NHG-normen.",
};

export default function MortgageCalculatorPage() {
    return <MortgageCalculator />;
}
