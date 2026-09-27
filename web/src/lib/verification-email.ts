const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export async function deliverVerificationEmail(input: {
    email: string;
    name: string;
    url: string;
}) {
    const apiKey = process.env.EMAIL_DELIVERY_TOKEN;
    if (!apiKey) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("EMAIL_DELIVERY_TOKEN must contain a Brevo API key");
        }

        console.info(
            `[ZelfWonen] Verification link for ${input.email}: ${input.url}`,
        );
        return;
    }

    // Retain the existing setting, but never send the API key to another host.
    const endpoint = process.env.EMAIL_DELIVERY_WEBHOOK_URL || BREVO_ENDPOINT;
    if (endpoint !== BREVO_ENDPOINT) {
        throw new Error(`EMAIL_DELIVERY_WEBHOOK_URL must be ${BREVO_ENDPOINT}`);
    }

    const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
            "content-type": "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify({
            sender: {
                name: process.env.EMAIL_FROM_NAME || "Redaxa Support",
                email: process.env.EMAIL_FROM_ADDRESS || "support@redaxa.nl",
            },
            to: [{ email: input.email }],
            subject: "Bevestig je e-mailadres voor ZelfWonen",
            textContent: [
                `Hallo ${input.name || "daar"},`,
                "Bevestig je e-mailadres voor ZelfWonen via onderstaande link:",
                input.url,
                "Deze link is één uur geldig. Heb je geen account aangemaakt? Dan kun je deze e-mail negeren.",
                "Redaxa Support",
            ].join("\n\n"),
        }),
    });

    if (!response.ok) {
        throw new Error(`Brevo email delivery failed (${response.status})`);
    }
}
