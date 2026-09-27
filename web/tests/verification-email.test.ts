import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { deliverVerificationEmail } from "../src/lib/verification-email";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalInfo = console.info;
const input = {
    email: "recipient@example.com",
    name: "Test User",
    url: "https://example.com/api/auth/verify-email?token=test",
};

afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
});

function configure() {
    process.env.EMAIL_DELIVERY_TOKEN = "test-api-key";
    delete process.env.EMAIL_DELIVERY_WEBHOOK_URL;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.EMAIL_FROM_ADDRESS;
}

test("sends a verification link through Brevo with the verified sender", async () => {
    configure();
    let calls = 0;
    globalThis.fetch = async (url, options) => {
        calls++;
        assert.equal(url, "https://api.brevo.com/v3/smtp/email");
        assert.equal(options?.method, "POST");
        assert.equal(new Headers(options?.headers).get("api-key"), "test-api-key");
        assert.equal(new Headers(options?.headers).get("authorization"), null);
        const body = JSON.parse(String(options?.body));
        assert.deepEqual(body.sender, { name: "Redaxa Support", email: "support@redaxa.nl" });
        assert.deepEqual(body.to, [{ email: input.email }]);
        assert.ok(body.textContent.includes(input.url));
        return new Response('{"messageId":"test"}', { status: 201 });
    };
    await deliverVerificationEmail(input);
    assert.equal(calls, 1);
});

test("reports provider rejection without exposing its response or credentials", async () => {
    configure();
    globalThis.fetch = async () => new Response("private provider details", { status: 429 });
    await assert.rejects(deliverVerificationEmail(input), /^Error: Brevo email delivery failed \(429\)$/);
});

test("requires credentials in production", async () => {
    delete process.env.EMAIL_DELIVERY_TOKEN;
    process.env = { ...process.env, NODE_ENV: "production" };
    await assert.rejects(deliverVerificationEmail(input), /EMAIL_DELIVERY_TOKEN/);
});

test("logs a local verification link without sending when no key is configured", async () => {
    delete process.env.EMAIL_DELIVERY_TOKEN;
    process.env = { ...process.env, NODE_ENV: "development" };
    let logged = "";
    console.info = (message: string) => { logged = message; };
    globalThis.fetch = async () => { throw new Error("Unexpected email request"); };
    await deliverVerificationEmail(input);
    assert.ok(logged.includes(input.url));
});

test("does not send the API key to a custom webhook", async () => {
    configure();
    process.env.EMAIL_DELIVERY_WEBHOOK_URL = "https://example.com/webhook";
    globalThis.fetch = async () => { throw new Error("Unexpected email request"); };
    await assert.rejects(deliverVerificationEmail(input), /EMAIL_DELIVERY_WEBHOOK_URL must be/);
});
