"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { ListingImage } from "@/components/listing/listing-image";

const copy = {
    nl: {
        gallery: "Fotogalerij",
        open: "Bekijk foto",
        close: "Galerij sluiten",
        previous: "Vorige foto",
        next: "Volgende foto",
    },
    en: {
        gallery: "Photo gallery",
        open: "View photo",
        close: "Close gallery",
        previous: "Previous photo",
        next: "Next photo",
    },
};

export function PropertyPhotoGallery({
    photos,
    title,
    language,
    className = "h-[55vh] min-h-96",
}: {
    photos: { id: string; src: string }[];
    title: string;
    language: "nl" | "en";
    className?: string;
}) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const isOpen = selectedIndex !== null;
    const t = copy[language];
    const visiblePhotos = photos.slice(0, 5);
    const hiddenCount = photos.length - visiblePhotos.length;
    const selectedPhoto = selectedIndex === null ? null : photos[selectedIndex];

    useEffect(() => {
        if (!isOpen) return;
        const dialog = dialogRef.current;
        if (!dialog) return;

        // Native modal dialogs trap focus, support Escape, and restore trigger focus.
        dialog.showModal();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!isOpen || !dialog || photos.length < 2) return;

        let accumulatedDelta = 0;
        let lastScrollAt = 0;
        let lastNavigationAt = -Infinity;

        function handleWheel(event: WheelEvent) {
            if (event.ctrlKey) return;
            event.preventDefault();

            const now = performance.now();
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
                ? event.deltaX
                : event.deltaY;
            const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
                ? 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                  ? window.innerHeight
                  : 1;

            // Ignore tiny gestures and limit trackpad momentum to a readable pace.
            if (now - lastScrollAt > 200 || Math.sign(delta) !== Math.sign(accumulatedDelta)) {
                accumulatedDelta = 0;
            }
            lastScrollAt = now;
            if (now - lastNavigationAt < 350) return;

            accumulatedDelta += delta * scale;
            if (Math.abs(accumulatedDelta) < 40) return;

            const direction = Math.sign(accumulatedDelta);
            setSelectedIndex((index) =>
                index === null ? null : (index + direction + photos.length) % photos.length,
            );
            accumulatedDelta = 0;
            lastNavigationAt = now;
        }

        dialog.addEventListener("wheel", handleWheel, { passive: false });
        return () => dialog.removeEventListener("wheel", handleWheel);
    }, [isOpen, photos.length]);

    function movePhoto(direction: number) {
        setSelectedIndex((index) =>
            index === null ? null : (index + direction + photos.length) % photos.length,
        );
    }

    if (photos.length === 0) return null;

    function renderPhoto(index: number) {
        const photo = visiblePhotos[index];
        return (
            <button
                key={photo.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-label={`${t.open} ${index + 1}: ${title}`}
                className="relative size-full min-h-0 min-w-0 cursor-pointer overflow-hidden focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-brand"
            >
                <ListingImage
                    src={photo.src}
                    alt={index === 0 ? title : ""}
                    width={index === 0 ? 1600 : 800}
                    height={index === 0 ? 1000 : 500}
                    priority={index === 0}
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                />
                {index === 0 && photos.length > 1 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-4xl font-semibold text-white md:hidden">
                        +{photos.length - 1}
                    </span>
                ) : null}
                {index === visiblePhotos.length - 1 && hiddenCount > 0 ? (
                    <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-4xl font-semibold text-white md:flex">
                        +{hiddenCount}
                    </span>
                ) : null}
            </button>
        );
    }

    return (
        <>
            <div className={`grid gap-2 overflow-hidden rounded-4xl md:grid-cols-2 ${className}`}>
                {renderPhoto(0)}
                <div className="hidden min-h-0 auto-rows-fr grid-cols-2 gap-2 md:grid">
                    {visiblePhotos.slice(1).map((_, index) => renderPhoto(index + 1))}
                    {photos.length === 1 ? (
                        <div className="col-span-2 grid size-full place-items-center bg-background text-brand/30">
                            <Building2 size={60} />
                        </div>
                    ) : null}
                </div>
            </div>
            <dialog
                ref={dialogRef}
                aria-label={`${t.gallery}: ${title}`}
                onClose={() => setSelectedIndex(null)}
                onCancel={() => setSelectedIndex(null)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                        event.preventDefault();
                        movePhoto(event.key === "ArrowLeft" ? -1 : 1);
                    }
                }}
                className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/95 p-4 text-white backdrop:bg-black sm:p-8"
            >
                {selectedPhoto && selectedIndex !== null ? (
                    <div className="flex h-full flex-col gap-4">
                        <div className="flex items-center justify-between gap-4">
                            <p aria-live="polite" aria-atomic="true" className="text-sm">
                                {selectedIndex + 1} / {photos.length}
                            </p>
                            <button
                                type="button"
                                aria-label={t.close}
                                onClick={() => setSelectedIndex(null)}
                                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <div className="relative min-h-0 flex-1">
                            <ListingImage
                                src={selectedPhoto.src}
                                alt={`${title} — ${t.open} ${selectedIndex + 1}`}
                                fill
                                sizes="100vw"
                                referrerPolicy="no-referrer"
                                className="object-contain"
                            />
                        </div>
                        {photos.length > 1 ? (
                            <div className="flex justify-center gap-4">
                                <button
                                    type="button"
                                    aria-label={t.previous}
                                    onClick={() => movePhoto(-1)}
                                    className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <button
                                    type="button"
                                    aria-label={t.next}
                                    onClick={() => movePhoto(1)}
                                    className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                                >
                                    <ChevronRight size={24} />
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </dialog>
        </>
    );
}
