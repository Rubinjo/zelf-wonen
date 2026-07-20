"use client";

import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

export function PropertyLocationMap({
    latitude,
    longitude,
    address,
}: {
    latitude: number;
    longitude: number;
    address: string;
}) {
    const markerIcon = divIcon({
        className: "property-location-marker-shell",
        html: '<span class="property-location-marker"><span></span></span>',
        iconAnchor: [22, 44],
    });

    return (
        <MapContainer
            center={[latitude, longitude]}
            zoom={15}
            minZoom={3}
            maxZoom={19}
            scrollWheelZoom
            className="h-full w-full"
            aria-label={address}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker
                position={[latitude, longitude]}
                icon={markerIcon}
                title={address}
            />
        </MapContainer>
    );
}
