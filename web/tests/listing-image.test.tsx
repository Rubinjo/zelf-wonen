import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ListingImage } from "../src/components/listing/listing-image";

for (const src of [
    "/aggregated-media/aggregated/35/new-import.webp",
    "/uploads/listings/new-photo.jpg",
    "https://media.example.com/aggregated/new-import.webp",
]) {
    test(`listing media loads directly: ${src}`, () => {
        const html = renderToStaticMarkup(createElement(ListingImage, {
            src, alt: "Listing photo", fill: true, sizes: "360px",
        }));
        assert.ok(html.includes(`src="${src}"`));
        assert.ok(!html.includes("/_next/image"));
        assert.ok(!html.includes("srcSet="));
        assert.ok(html.includes('loading="lazy"'));
        assert.ok(html.includes('position:absolute'));
    });
}

test("a priority listing image preloads the direct media URL", () => {
    const src = "/uploads/listings/cover.jpg";
    const html = renderToStaticMarkup(createElement(ListingImage, {
        src, alt: "Cover photo", width: 800, height: 480, priority: true,
    }));
    assert.ok(html.includes(`href="${src}"`));
    assert.ok(html.includes('rel="preload"'));
    assert.ok(html.includes(`src="${src}"`));
    assert.ok(!html.includes("/_next/image"));
    assert.ok(!html.includes('loading="lazy"'));
});
