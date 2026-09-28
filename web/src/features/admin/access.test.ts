import assert from "node:assert/strict";
import test from "node:test";
import { isAdminUser } from "./access";

test("only the configured, verified owner is an admin", () => {
    assert.equal(isAdminUser({ id: "owner", emailVerified: true }, "owner"), true);
    assert.equal(isAdminUser({ id: "other", emailVerified: true }, "owner"), false);
    assert.equal(isAdminUser({ id: "owner", emailVerified: false }, "owner"), false);
    assert.equal(isAdminUser({ id: "owner", emailVerified: true }, "", ""), false);
    assert.equal(isAdminUser({ id: "owner", emailVerified: true }, "   ", ""), false);
    assert.equal(isAdminUser({ id: "owner", emailVerified: true }, " owner "), true);
});

test("email access requires the configured verified email and respects ID precedence", () => {
    const user = { id: "owner", email: "Owner@example.com", emailVerified: true };
    assert.equal(isAdminUser(user, "", " owner@EXAMPLE.com "), true);
    assert.equal(isAdminUser({ ...user, emailVerified: false }, "", "owner@example.com"), false);
    assert.equal(isAdminUser(user, "", "someone@example.com"), false);
    assert.equal(isAdminUser(user, "different-id", "owner@example.com"), false);
    assert.equal(isAdminUser(user, "", ""), false);
});
