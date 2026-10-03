import Image, { type ImageProps } from "next/image";

// Runtime media is served by Caddy. Next's internal optimizer bypasses Caddy
// and cannot reliably resolve files added to public/ after server startup.
export function ListingImage({ alt, ...props }: Omit<ImageProps, "unoptimized">) {
    return <Image {...props} alt={alt} unoptimized />;
}
