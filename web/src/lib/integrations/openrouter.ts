import { generateText, type ModelMessage, type Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Gedeelde OpenRouter-client voor AI-functies.
 *
 * De Auto Router (model-id "openrouter/auto") kiest automatisch het beste
 * beschikbare model voor de prompt; zie
 * https://openrouter.ai/docs/guides/routing/routers/auto-router
 */
export function getOpenRouter() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;
    return createOpenRouter({
        apiKey,
        compatibility: "strict",
    });
}

export const OPENROUTER_AUTO_ROUTER_MODEL = "openrouter/auto";

/**
 * Resolves het Auto Router-model via de OpenRouter-provider.
 *
 * Belangrijk: de AI SDK gebruikt een plat string-model-id als AI Gateway-model;
 * om daadwerkelijk via OpenRouter te routeren moet de provider-instantie
 * aangeroepen worden. Geeft null terug wanneer OPENROUTER_API_KEY ontbreekt.
 */
export function getOpenRouterAutoRouterModel() {
    const openrouter = getOpenRouter();
    if (!openrouter) return null;
    return openrouter(OPENROUTER_AUTO_ROUTER_MODEL);
}

/**
 * Resolves een specifiek OpenRouter-model via de provider-instantie.
 * Geeft null terug wanneer OPENROUTER_API_KEY ontbreekt.
 */
export function getOpenRouterModel(modelId: string) {
    const openrouter = getOpenRouter();
    if (!openrouter) return null;
    return openrouter(modelId);
}

/**
 * De gratis modellen uit de Auto Router-restricties, als directe
 * terugvalopties. De Auto Router rangschikt kandidaten op marktaandeel
 * (besteding) en gratis modellen staan daar niet in; beperkt tot alleen
 * :free-slugs geeft de router daarom altijd "No models match". Deze
 * modellen werken wel degelijk via een directe aanroep.
 */
export const OPENROUTER_FREE_FALLBACK_MODEL_IDS = [
    "nvidia/nemotron-3.5-lightning:free",
    "minimax/minimax-m3:free",
    "thinkingmachines/inkling:free",
    "minimax/minimax-m2.7:free",
] as const;

/**
 * Configuratie voor de Auto Router-plugin: laagste kostenband en alleen
 * gratis modellen als kandidaten. Zie
 * https://openrouter.ai/docs/guides/routing/routers/auto-router#configuring-allowed-models
 */
export const AUTO_ROUTER_PLUGIN_CONFIG = {
    id: "auto-router",
    cost_tier: "low",
    allowed_models: [
        "nvidia/nemotron-3.5-lightning:free",
        "minimax/minimax-m3:free",
        "thinkingmachines/inkling:free",
        "minimax/minimax-m2.7:free",
    ],
};

/**
 * Voert een `generateText`-aanroep uit met gratis-model-terugval.
 *
 * Eerst wordt de Auto Router geprobeerd mét de plugin-restrictie (alleen
 * gratis modellen, laagste kostenband). De Auto Router rangschikt kandidaten
 * echter op marktaandeel en kent geen :free-slugs, dus die poging faalt
 * doorgaans met "No models match" of een 402 (onvoldoende credits). In dat
 * geval worden dezelfde gratis modellen rechtstreeks aangeroepen, in de
 * volgorde van OPENROUTER_FREE_FALLBACK_MODEL_IDS, tot er eentje slaagt.
 *
 * Gooit OpenRouterUnavailableError wanneer OPENROUTER_API_KEY ontbreekt of
 * wanneer ook alle terugvalmodellen falen.
 */
type FreeFallbackOptions<OUTPUT> = (
    | { prompt: string; messages?: never }
    | { messages: ModelMessage[]; prompt?: never }
) & {
    temperature?: number;
    seed?: number;
    system?: string;
    output?: Output.Output<OUTPUT>;
};

export async function generateTextWithFreeFallback<OUTPUT>(
    options: FreeFallbackOptions<OUTPUT>,
): Promise<{ text: string; output: OUTPUT | undefined }> {
    const autoRouterModel = getOpenRouterAutoRouterModel();
    if (!autoRouterModel)
        throw new OpenRouterUnavailableError("OPENROUTER_NOT_CONFIGURED");

    try {
        // Resolves via de OpenRouter-provider; een plat string-id zou door de
        // AI SDK als AI Gateway-model worden opgevat (GatewayAuthenticationError).
        return await generateText({
            ...options,
            model: autoRouterModel,
            providerOptions: {
                openrouter: { plugins: [AUTO_ROUTER_PLUGIN_CONFIG] },
            },
        });
    } catch {
        // Routering mislukt (bijv. "No models match" of onvoldoende credits):
        // probeer de gratis modellen rechtstreeks.
        for (const modelId of OPENROUTER_FREE_FALLBACK_MODEL_IDS) {
            const model = getOpenRouterModel(modelId);
            if (!model) break;
            try {
                return await generateText({ ...options, model });
            } catch {
                continue;
            }
        }
    }
    throw new OpenRouterUnavailableError("AI_NO_OUTPUT");
}

/**
 * Foutsignaal voor bellers: OpenRouter is niet geconfigureerd of alle
 * modellen (Auto Router + gratis terugval) zijn mislukt.
 */
export class OpenRouterUnavailableError extends Error {}
