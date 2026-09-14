import Image from "next/image";

const LOGO_WIDTH = 2172;
const LOGO_HEIGHT = 724;

/**
 * ZelfWonen logo lockup (icon + wordmark).
 *
 * The wordmark is near-black, so the same artwork ships in two colour variants:
 * `logo.svg` for light surfaces and `logo-dark.svg` for dark surfaces, where
 * the default logo would disappear against the background. Both variants are
 * swapped with the `dark` variant.
 */
export function BrandLogo({
    className = "h-9 w-auto",
    priority = false,
}: {
    /** Sizing utilities for the lockup, e.g. `h-9 w-auto`. */
    className?: string;
    /** Set on the logo that renders above the fold. */
    priority?: boolean;
}) {
    return (
        <>
            <Image
                src="/logo.svg"
                alt="ZelfWonen"
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
                priority={priority}
                className={`${className} dark:hidden`}
            />
            <Image
                src="/logo-dark.svg"
                alt="ZelfWonen"
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
                priority={priority}
                className={`${className} hidden dark:block`}
            />
        </>
    );
}
