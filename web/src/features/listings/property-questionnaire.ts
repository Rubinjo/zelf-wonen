export type QuestionnaireAnswerValue =
    | "YES"
    | "NO"
    | "UNKNOWN"
    | "NOT_APPLICABLE";

export type QuestionnaireAnswer = {
    questionId: string;
    answer: QuestionnaireAnswerValue;
    details: string;
};

export type QuestionnaireSection = {
    id: string;
    title: string;
    description: string;
    propertyTypes?: string[];
    questions: Array<{
        id: string;
        text: string;
        hint?: string;
    }>;
};

export const propertyQuestionnaireSections: QuestionnaireSection[] = [
    {
        id: "legal",
        title: "Juridische situatie en gebruik",
        description:
            "Afspraken, beperkingen en het huidige gebruik van de woning.",
        questions: [
            {
                id: "legal-rights-restrictions",
                text: "Zijn er bijzondere rechten, lasten, beperkingen of afspraken die bij de woning horen?",
                hint: "Denk aan erfpacht, recht van overpad, kettingbedingen, voorkeursrecht of zelfbewoningsplicht.",
            },
            {
                id: "legal-boundaries-third-party-land",
                text: "Zijn er afwijkende erfgrenzen of worden grond of ruimten van anderen gebruikt?",
            },
            {
                id: "legal-rented-or-in-use",
                text: "Is de woning of een deel daarvan verhuurd of bij iemand anders in gebruik?",
            },
            {
                id: "legal-dispute-procedure",
                text: "Loopt er een geschil, bezwaar of procedure over de woning of met omwonenden?",
            },
            {
                id: "legal-required-work",
                text: "Zijn door de overheid, VvE of een nutsbedrijf werkzaamheden of herstelmaatregelen aangekondigd die nog niet zijn uitgevoerd?",
            },
        ],
    },
    {
        id: "condition",
        title: "Bouwkundige staat",
        description:
            "Bekende schade, vochtproblemen en gebreken aan de constructie.",
        questions: [
            {
                id: "condition-moisture-leaks",
                text: "Zijn er nu of in het verleden lekkages, vochtdoorslag of vochtplekken geweest?",
            },
            {
                id: "condition-mould",
                text: "Is er schimmelvorming in de woning aanwezig of aanwezig geweest?",
            },
            {
                id: "condition-cracks-damage",
                text: "Zijn er scheuren of beschadigingen aan gevels, wanden, plafonds of vloeren?",
            },
            {
                id: "condition-foundation-floors",
                text: "Zijn er bekende gebreken aan de fundering, kruipruimte of vloerconstructie?",
                hint: "Bijvoorbeeld verzakking, doorbuiging, aantasting of terugkerende wateroverlast.",
            },
            {
                id: "condition-roof-drainage",
                text: "Zijn er bekende gebreken of verstoppingen aan het dak, de dakgoten of hemelwaterafvoer?",
            },
        ],
    },
    {
        id: "exterior",
        title: "Gevels, kozijnen en isolatie",
        description: "De staat van de buitenschil en bekende isolatiepunten.",
        questions: [
            {
                id: "exterior-facade-defects",
                text: "Zijn er bekende gebreken aan gevels, balkons, kozijnen, ramen of buitendeuren?",
            },
            {
                id: "exterior-locks-keys",
                text: "Functioneren de ramen, deuren en sloten en zijn de bijbehorende sleutels aanwezig?",
            },
            {
                id: "exterior-glazing-condensation",
                text: "Is er condens tussen dubbel glas of zijn er lekke of beschadigde ruiten?",
            },
            {
                id: "exterior-insulation-complete",
                text: "Is de bij u bekende dak-, gevel- en vloerisolatie volledig en zonder gebreken?",
            },
        ],
    },
    {
        id: "installations",
        title: "Technische installaties",
        description: "Verwarming, elektra, leidingen en ventilatie.",
        questions: [
            {
                id: "installations-heating",
                text: "Functioneren de verwarmings- en warmwaterinstallaties naar behoren?",
            },
            {
                id: "installations-electricity",
                text: "Zijn er bekende gebreken aan de elektrische installatie, meterkast, schakelaars of stopcontacten?",
            },
            {
                id: "installations-pipes-radiators",
                text: "Zijn er lekkende, bevroren of niet goed werkende leidingen, radiatoren of vloerverwarming?",
            },
            {
                id: "installations-ventilation",
                text: "Functioneren de mechanische ventilatie, airconditioning en andere ventilatiesystemen naar behoren?",
            },
            {
                id: "installations-equipment-contracts",
                text: "Zijn technische installaties gehuurd, geleased of eigendom van een leverancier?",
                hint: "Bijvoorbeeld een cv-ketel, warmtepomp, zonnepanelen, laadpaal of warmte-afleverset.",
            },
        ],
    },
    {
        id: "sanitary",
        title: "Sanitair, riolering en keuken",
        description:
            "De werking en staat van natte ruimten en vaste apparatuur.",
        questions: [
            {
                id: "sanitary-damage",
                text: "Zijn er beschadigingen of gebreken aan sanitair, kranen, douche, bad of toiletten?",
            },
            {
                id: "sanitary-drains-sewer",
                text: "Zijn er problemen met afvoeren of riolering, zoals verstopping, lekkage of stankoverlast?",
            },
            {
                id: "sanitary-built-in-appliances",
                text: "Functioneren de keukeninstallaties en alle achterblijvende inbouwapparaten naar behoren?",
            },
        ],
    },
    {
        id: "environment",
        title: "Materialen, bodem en omgeving",
        description: "Mogelijke risico's in of rond de woning.",
        questions: [
            {
                id: "environment-asbestos",
                text: "Zijn er asbesthoudende of mogelijk asbesthoudende materialen aanwezig?",
            },
            {
                id: "environment-lead-pipes",
                text: "Zijn er loden waterleidingen aanwezig?",
            },
            {
                id: "environment-soil-tank",
                text: "Is er bodemverontreiniging bekend of is er een ondergrondse tank aanwezig of aanwezig geweest?",
            },
            {
                id: "environment-pests-wood",
                text: "Is er overlast of aantasting door ongedierte, houtworm, boktor of zwam?",
            },
            {
                id: "environment-invasive-plants",
                text: "Zijn er invasieve planten zoals Japanse duizendknoop op het perceel aanwezig?",
            },
        ],
    },
    {
        id: "renovations",
        title: "Verbouwingen, documenten en contracten",
        description:
            "Uitgevoerde werkzaamheden en overdraagbare verplichtingen.",
        questions: [
            {
                id: "renovations-work",
                text: "Hebben er verbouwingen, aanbouwen of constructieve wijzigingen plaatsgevonden?",
            },
            {
                id: "renovations-permits",
                text: "Zijn voor alle uitgevoerde werkzaamheden de benodigde vergunningen en toestemmingen verkregen?",
            },
            {
                id: "renovations-warranties",
                text: "Zijn er lopende garanties of onderhoudscontracten die aan de koper kunnen worden overgedragen?",
            },
            {
                id: "renovations-lease-contracts",
                text: "Zijn er lease-, huurkoop- of andere contracten die betrekking hebben op onderdelen van de woning?",
            },
            {
                id: "renovations-outstanding-costs",
                text: "Zijn er achterstallige belastingen, bijdragen of andere woninggebonden bedragen?",
            },
            {
                id: "renovations-other-information",
                text: "Zijn er andere feiten of omstandigheden die een koper volgens u moet weten?",
            },
        ],
    },
    {
        id: "owners-association",
        title: "Vereniging van Eigenaars",
        description:
            "Organisatie, onderhoud, financiën en lopende besluiten van de VvE.",
        propertyTypes: ["APARTMENT"],
        questions: [
            {
                id: "vve-active-registered",
                text: "Is de VvE actief en ingeschreven bij de Kamer van Koophandel?",
            },
            {
                id: "vve-reserve-mjop",
                text: "Heeft de VvE een reservefonds en een actueel meerjarenonderhoudsplan?",
            },
            {
                id: "vve-documents-decisions",
                text: "Zijn recente notulen, jaarstukken en besluiten van de VvE beschikbaar?",
            },
            {
                id: "vve-contributions-paid",
                text: "Zijn alle VvE-bijdragen betaald en zijn er geen bijzondere bijdragen aangekondigd?",
            },
        ],
    },
];

export function getQuestionnaireSections(propertyType: string) {
    return propertyQuestionnaireSections.filter(
        (section) =>
            !section.propertyTypes ||
            section.propertyTypes.includes(propertyType),
    );
}
