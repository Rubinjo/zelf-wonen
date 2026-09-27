import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider } from "../src/components/providers/language-provider";
import { useTranslations } from "../src/lib/messages/use-translations";
import { useListingCopy } from "../src/lib/messages/use-listing-copy";
import { propertyQuestionnaireSections } from "../src/features/listings/property-questionnaire";
import { gardenOrientationLabels } from "../src/features/listings/garden";
import { erfpachtOptions, parkingOptions, propertyAmenityOptions, roofTypeOptions } from "../src/lib/property-options";
import { translateListingCopy, translateListingIssue } from "../src/lib/messages/listing-copy";

test("every questionnaire prompt and shared property option has English copy", () => {
    const labels = [
        ...Object.values(gardenOrientationLabels),
        ...propertyQuestionnaireSections.flatMap(section => [
            section.title,
            section.description,
            ...section.questions.flatMap(question => [question.text, ...(question.hint ? [question.hint] : [])]),
        ]),
        ...[...erfpachtOptions, ...parkingOptions, ...propertyAmenityOptions, ...roofTypeOptions].map(option => option.label),
    ];
    for (const label of labels) {
        assert.notEqual(translateListingCopy("en", label), label, label);
        assert.equal(translateListingCopy("nl", label), label);
    }
});

test("publication validation translates counts and preserves Dutch messages", () => {
    assert.equal(translateListingIssue("en", "Upload minimaal 5 foto's (er zijn er 2)"), "Upload at least 5 photos (2 uploaded)");
    assert.equal(translateListingIssue("en", "Beantwoord de vragenlijst volledig (nog 1 vraag open)"), "Complete the questionnaire (1 question remaining)");
    assert.equal(translateListingIssue("en", "Beantwoord de vragenlijst volledig (nog 12 vragen open)"), "Complete the questionnaire (12 questions remaining)");
    assert.equal(translateListingIssue("en", "Vul een vraagprijs in"), "Enter an asking price");
    assert.equal(translateListingIssue("nl", "Vul een vraagprijs in"), "Vul een vraagprijs in");
    assert.equal(translateListingCopy("en", "User-written property description"), "User-written property description");
});

test("server rendering uses the saved language for both translation hooks", () => {
    function Labels() {
        const { language } = useTranslations();
        const { t } = useListingCopy();
        return createElement("span", null, language + ": " + t("Concept opslaan"));
    }
    for (const language of ["nl", "en"] as const) {
        const html = renderToStaticMarkup(
            <LanguageProvider initialLanguage={language}><Labels /></LanguageProvider>,
        );
        assert.equal(html, language === "en" ? "<span>en: Save draft</span>" : "<span>nl: Concept opslaan</span>");
    }
});
