"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type Vector3 = [number, number, number];

function addBox(
    parent: THREE.Group,
    size: Vector3,
    position: Vector3,
    material: THREE.Material,
    radius = 0,
) {
    const geometry = radius
        ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius)
        : new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function addCylinder(
    parent: THREE.Group,
    radius: number,
    height: number,
    position: Vector3,
    material: THREE.Material,
) {
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.92, height, 20),
        material,
    );
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function addPlant(
    parent: THREE.Group,
    position: Vector3,
    potMaterial: THREE.Material,
    leafMaterial: THREE.Material,
    scale = 1,
) {
    const meshes: THREE.Mesh[] = [];
    meshes.push(
        addCylinder(
            parent,
            0.18 * scale,
            0.32 * scale,
            [position[0], position[1] + 0.16 * scale, position[2]],
            potMaterial,
        ),
    );
    const stems = [
        [-0.1, 0.54, 0],
        [0.08, 0.62, -0.04],
        [0, 0.72, 0.07],
    ] as const;
    stems.forEach(([x, y, z], index) => {
        const stem = addCylinder(
            parent,
            0.025 * scale,
            0.5 * scale,
            [
                position[0] + x * scale,
                position[1] + y * scale,
                position[2] + z * scale,
            ],
            leafMaterial,
        );
        stem.rotation.z = (index - 1) * 0.22;
        meshes.push(stem);
        const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(0.2 * scale, 18, 12),
            leafMaterial,
        );
        leaf.scale.set(0.55, 1.3, 0.42);
        leaf.rotation.z = (index - 1) * 0.55;
        leaf.position.set(
            position[0] + x * 1.9 * scale,
            position[1] + (y + 0.18) * scale,
            position[2] + z * scale,
        );
        leaf.castShadow = true;
        parent.add(leaf);
        meshes.push(leaf);
    });
    return meshes;
}

export function HomeScene({ label }: { label: string }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-5, 5, 3.2, -3.2, 0.1, 100);
        camera.position.set(9, 7.5, 10);
        camera.lookAt(0, 1.25, 0);

        const renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
            preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        container.appendChild(renderer.domElement);

        const room = new THREE.Group();
        room.position.y = -0.58;
        scene.add(room);

        const material = (color: number, roughness = 0.72) =>
            new THREE.MeshStandardMaterial({ color, roughness });
        const floorMaterial = material(0xa98259, 0.82);
        const wallMaterial = material(0xf1f0eb, 0.92);
        const wallSideMaterial = material(0xe5e8e5, 0.92);
        const whiteMaterial = material(0xf8f8f4, 0.55);
        const sofaMaterial = material(0xdce8e8, 0.82);
        const cushionMaterial = material(0xf0f4f2, 0.86);
        const woodMaterial = material(0xb5793f, 0.74);
        const darkWoodMaterial = material(0x694933, 0.82);
        const rugMaterial = material(0xd8d2c7, 0.95);
        const metalMaterial = material(0x263a37, 0.42);
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0xbfe2e9,
            roughness: 0.18,
            transparent: true,
            opacity: 0.58,
        });
        const greenMaterial = material(0x4e7957, 0.85);
        const terracottaMaterial = material(0xbb7250, 0.9);
        const accentMaterial = material(0xd2a648, 0.7);
        const screenMaterial = material(0x253536, 0.28);

        addBox(room, [7.2, 0.18, 5.5], [0, 0, 0], floorMaterial);
        addBox(room, [7.2, 3.8, 0.18], [0, 2, -2.85], wallMaterial);
        addBox(room, [0.18, 3.8, 5.5], [-3.7, 2, 0], wallSideMaterial);

        for (let index = 0; index < 10; index += 1) {
            addBox(
                room,
                [0.025, 0.012, 5.25],
                [-3.15 + index * 0.7, 0.104, 0],
                darkWoodMaterial,
            );
        }

        const windowGroup = new THREE.Group();
        windowGroup.position.z = -0.18;
        room.add(windowGroup);
        addBox(
            windowGroup,
            [3.2, 1.65, 0.05],
            [1.45, 2.25, -2.55],
            glassMaterial,
        );
        addBox(windowGroup, [3.45, 0.1, 0.11], [1.45, 3.1, -2.5], woodMaterial);
        addBox(windowGroup, [3.45, 0.1, 0.11], [1.45, 1.4, -2.5], woodMaterial);
        [-0.28, 1.45, 3.18].forEach((x) =>
            addBox(
                windowGroup,
                [0.09, 1.8, 0.11],
                [x, 2.25, -2.5],
                woodMaterial,
            ),
        );
        addBox(
            windowGroup,
            [3.3, 0.06, 0.12],
            [1.45, 2.25, -2.49],
            woodMaterial,
        );

        const sofa = new THREE.Group();
        sofa.position.set(1.35, 0.12, -1.42);
        room.add(sofa);
        addBox(sofa, [3.15, 0.5, 1.05], [0, 0.42, 0], sofaMaterial, 0.16);
        addBox(sofa, [3.15, 1.05, 0.3], [0, 1.02, -0.38], sofaMaterial, 0.14);
        addBox(sofa, [0.28, 0.68, 1.08], [-1.47, 0.67, 0], sofaMaterial, 0.12);
        addBox(sofa, [0.28, 0.68, 1.08], [1.47, 0.67, 0], sofaMaterial, 0.12);
        addBox(
            sofa,
            [0.82, 0.18, 0.72],
            [-0.73, 0.75, 0.08],
            cushionMaterial,
            0.08,
        );
        addBox(
            sofa,
            [0.82, 0.18, 0.72],
            [0.23, 0.75, 0.08],
            cushionMaterial,
            0.08,
        );
        addBox(
            sofa,
            [0.58, 0.62, 0.16],
            [0.85, 1.03, -0.12],
            cushionMaterial,
            0.09,
        ).rotation.z = -0.12;

        addBox(room, [3.55, 0.08, 2.25], [0.85, 0.14, 0.78], rugMaterial, 0.08);

        addBox(room, [1.9, 0.2, 1.05], [0.75, 0.95, 0.8], woodMaterial, 0.08);
        [-0.02, 1.52].forEach((x) => {
            [-0.38, 0.38].forEach((z) =>
                addBox(
                    room,
                    [0.11, 0.76, 0.11],
                    [x, 0.54, 0.8 + z],
                    darkWoodMaterial,
                ),
            );
        });
        addCylinder(room, 0.08, 0.35, [0.75, 1.25, 0.8], whiteMaterial);
        const flower = new THREE.Mesh(
            new THREE.SphereGeometry(0.17, 16, 10),
            accentMaterial,
        );
        flower.position.set(0.75, 1.5, 0.8);
        room.add(flower);

        const desk = new THREE.Group();
        desk.position.set(-3.02, 0.1, 0.15);
        desk.rotation.y = Math.PI / 2;
        room.add(desk);
        addBox(desk, [1.65, 0.16, 0.7], [0, 1.05, 0], whiteMaterial, 0.04);
        [-0.68, 0.68].forEach((x) =>
            addBox(desk, [0.12, 1, 0.55], [x, 0.52, 0], whiteMaterial),
        );
        addBox(
            desk,
            [0.78, 0.48, 0.05],
            [0, 1.45, -0.08],
            screenMaterial,
            0.03,
        );
        addBox(desk, [0.2, 0.12, 0.12], [0, 1.18, -0.05], metalMaterial);
        addBox(desk, [0.62, 0.04, 0.24], [0, 1.16, 0.2], cushionMaterial, 0.02);

        const chair = new THREE.Group();
        chair.position.set(-2.28, 0.1, 0.15);
        chair.rotation.y = Math.PI / 2;
        room.add(chair);
        addBox(chair, [0.64, 0.16, 0.62], [0, 0.73, 0], cushionMaterial, 0.08);
        addBox(
            chair,
            [0.64, 0.75, 0.15],
            [0, 1.15, 0.25],
            cushionMaterial,
            0.08,
        );
        [-0.24, 0.24].forEach((x) => {
            [-0.2, 0.2].forEach((z) =>
                addBox(chair, [0.06, 0.68, 0.06], [x, 0.36, z], woodMaterial),
            );
        });

        const cabinet = new THREE.Group();
        cabinet.position.set(-2.72, 0.1, -2.58);
        room.add(cabinet);
        addBox(cabinet, [1.18, 2.45, 0.42], [0, 1.22, 0], whiteMaterial, 0.04);
        addBox(
            cabinet,
            [0.96, 1.35, 0.05],
            [0, 1.65, 0.24],
            darkWoodMaterial,
            0.02,
        );
        [1.08, 1.58, 2.08].forEach((y) =>
            addBox(
                cabinet,
                [0.96, 0.07, 0.34],
                [0, y, 0.2],
                woodMaterial,
                0.02,
            ),
        );
        addBox(
            cabinet,
            [0.48, 0.72, 0.06],
            [-0.25, 0.48, 0.24],
            wallMaterial,
            0.02,
        );
        addBox(
            cabinet,
            [0.48, 0.72, 0.06],
            [0.25, 0.48, 0.24],
            wallMaterial,
            0.02,
        );
        [-0.06, 0.06].forEach((x) =>
            addCylinder(cabinet, 0.025, 0.16, [x, 0.48, 0.29], metalMaterial),
        );
        const couchPlant = addPlant(
            room,
            [2.9, 0.1, -1.85],
            terracottaMaterial,
            greenMaterial,
            1.1,
        );
        couchPlant.forEach((mesh) => mesh.layers.set(1));
        addPlant(room, [-3.08, 0.1, 1.85], whiteMaterial, greenMaterial, 0.85);
        addPlant(
            room,
            [0.02, 1.46, -2.6],
            terracottaMaterial,
            greenMaterial,
            0.38,
        );

        addBox(
            room,
            [0.82, 1.05, 0.05],
            [-1.08, 2.38, -2.69],
            whiteMaterial,
            0.03,
        );
        addBox(
            room,
            [0.68, 0.9, 0.03],
            [-1.08, 2.38, -2.64],
            accentMaterial,
            0.02,
        );
        addBox(
            room,
            [0.62, 0.82, 0.05],
            [-3.4, 2.42, 0.82],
            whiteMaterial,
            0.03,
        ).rotation.y = Math.PI / 2;
        addBox(
            room,
            [0.5, 0.7, 0.03],
            [-3.35, 2.42, 0.82],
            greenMaterial,
            0.02,
        ).rotation.y = Math.PI / 2;

        const ambientLight = new THREE.HemisphereLight(
            0xffffff,
            0x9ca79f,
            2.25,
        );
        ambientLight.layers.enable(1);
        scene.add(ambientLight);
        const sunlight = new THREE.DirectionalLight(0xfff4dc, 4.6);
        sunlight.position.set(-5, 10, 8);
        sunlight.castShadow = true;
        sunlight.shadow.mapSize.set(1024, 1024);
        sunlight.shadow.camera.left = -8;
        sunlight.shadow.camera.right = 8;
        sunlight.shadow.camera.top = 8;
        sunlight.shadow.camera.bottom = -8;
        sunlight.shadow.bias = -0.0008;
        sunlight.layers.enable(1);
        scene.add(sunlight);

        let pointerTarget = 0;
        let animationFrame = 0;
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        function resize() {
            const width = container?.clientWidth ?? 1;
            const height = container?.clientHeight ?? 1;
            const aspect = width / height;
            const viewHeight = 6.25;
            camera.left = (-viewHeight * aspect) / 2;
            camera.right = (viewHeight * aspect) / 2;
            camera.top = viewHeight / 2;
            camera.bottom = -viewHeight / 2;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
        }

        function render() {
            if (!reducedMotion)
                room.rotation.y += (pointerTarget - room.rotation.y) * 0.035;
            camera.layers.set(0);
            renderer.render(scene, camera);
            renderer.autoClear = false;
            renderer.clearDepth();
            camera.layers.set(1);
            renderer.render(scene, camera);
            renderer.autoClear = true;
            animationFrame = window.requestAnimationFrame(render);
        }

        function handlePointerMove(event: PointerEvent) {
            const bounds = container?.getBoundingClientRect();
            if (!bounds || reducedMotion) return;
            pointerTarget =
                ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.07;
        }

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        container.addEventListener("pointermove", handlePointerMove);
        resize();
        render();

        return () => {
            window.cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
            container.removeEventListener("pointermove", handlePointerMove);
            const geometries = new Set<THREE.BufferGeometry>();
            const materials = new Set<THREE.Material>();
            scene.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return;
                geometries.add(object.geometry);
                const meshMaterials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];
                meshMaterials.forEach((meshMaterial) =>
                    materials.add(meshMaterial),
                );
            });
            geometries.forEach((geometry) => geometry.dispose());
            materials.forEach((meshMaterial) => meshMaterial.dispose());
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);

    return (
        <figure
            className="relative h-40 w-full overflow-hidden rounded-2xl bg-[#e8e7e3] sm:h-44"
            role="img"
            aria-label={label}
        >
            <div ref={containerRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-white/25 to-transparent" />
        </figure>
    );
}
