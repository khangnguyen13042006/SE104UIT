"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Sparkles, Compass, ShieldCheck } from "lucide-react";

export default function HeroPitch3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const rotationTargetRef = useRef({ x: 0.65, y: 0.45 });
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background

    // Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, 16, 22);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Main Group to rotate
    const stadiumGroup = new THREE.Group();
    stadiumGroup.rotation.x = 0.55;
    stadiumGroup.rotation.y = 0.35;
    scene.add(stadiumGroup);

    // 1. Pitch Turf with striped grass
    const pitchWidth = 22;
    const pitchLength = 14;
    const turfCanvas = document.createElement("canvas");
    turfCanvas.width = 512;
    turfCanvas.height = 512;
    const ctx = turfCanvas.getContext("2d");
    if (ctx) {
      // Grass stripes
      const stripeCount = 10;
      const stripeHeight = turfCanvas.height / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#15803d" : "#16a34a";
        ctx.fillRect(0, i * stripeHeight, turfCanvas.width, stripeHeight);
      }
      // Grass subtle noise texture
      ctx.fillStyle = "rgba(0,0,0,0.04)";
      for (let i = 0; i < 4000; i++) {
        const rx = Math.random() * turfCanvas.width;
        const ry = Math.random() * turfCanvas.height;
        ctx.fillRect(rx, ry, 2, 2);
      }
    }
    const turfTexture = new THREE.CanvasTexture(turfCanvas);
    turfTexture.wrapS = THREE.RepeatWrapping;
    turfTexture.wrapT = THREE.RepeatWrapping;

    const pitchGeo = new THREE.PlaneGeometry(pitchWidth, pitchLength);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: turfTexture,
      roughness: 0.85,
      metalness: 0.05,
    });
    const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
    pitchMesh.rotation.x = -Math.PI / 2;
    pitchMesh.receiveShadow = true;
    stadiumGroup.add(pitchMesh);

    // Stadium Base Border / Stand Rim
    const baseGeo = new THREE.BoxGeometry(pitchWidth + 2.5, 1.2, pitchLength + 2.5);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.5,
      metalness: 0.3,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.62;
    baseMesh.receiveShadow = true;
    stadiumGroup.add(baseMesh);

    // Inner glowing ring
    const borderGeo = new THREE.BoxGeometry(pitchWidth + 0.3, 0.15, pitchLength + 0.3);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.y = -0.05;
    stadiumGroup.add(borderMesh);

    // 2. White Pitch Markings (Line segments slightly above turf)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const createLine = (w: number, h: number, x: number, z: number, rotY = 0) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Mesh(g, lineMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rotY;
      m.position.set(x, 0.02, z);
      stadiumGroup.add(m);
    };

    const lw = 0.12; // line thickness
    const halfW = (pitchWidth - 2) / 2;
    const halfL = (pitchLength - 2) / 2;

    // Outer touchlines
    createLine((pitchWidth - 2), lw, 0, -halfL);
    createLine((pitchWidth - 2), lw, 0, halfL);
    createLine(lw, (pitchLength - 2), -halfW, 0);
    createLine(lw, (pitchLength - 2), halfW, 0);

    // Halfway line
    createLine(lw, (pitchLength - 2), 0, 0);

    // Center circle
    const circleGeo = new THREE.RingGeometry(2.3, 2.3 + lw, 48);
    const circleMesh = new THREE.Mesh(circleGeo, lineMat);
    circleMesh.rotation.x = -Math.PI / 2;
    circleMesh.position.set(0, 0.02, 0);
    stadiumGroup.add(circleMesh);

    // Center spot
    const spotGeo = new THREE.CircleGeometry(0.2, 16);
    const spotMesh = new THREE.Mesh(spotGeo, lineMat);
    spotMesh.rotation.x = -Math.PI / 2;
    spotMesh.position.set(0, 0.02, 0);
    stadiumGroup.add(spotMesh);

    // Penalty Areas (Left and Right)
    const boxWidth = 3.6;
    const boxLength = 6.4;
    // Left Box
    createLine(boxWidth, lw, -halfW + boxWidth / 2, -boxLength / 2);
    createLine(boxWidth, lw, -halfW + boxWidth / 2, boxLength / 2);
    createLine(lw, boxLength, -halfW + boxWidth, 0);

    // Right Box
    createLine(boxWidth, lw, halfW - boxWidth / 2, -boxLength / 2);
    createLine(boxWidth, lw, halfW - boxWidth / 2, boxLength / 2);
    createLine(lw, boxLength, halfW - boxWidth, 0);

    // 3. 3D Goal Posts
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });

    const createGoal = (xSide: number) => {
      const goalGroup = new THREE.Group();
      const postRadius = 0.08;
      const goalHeight = 1.6;
      const goalSpan = 3.2;
      const goalDepth = 1.2;

      // Posts
      const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 16);
      const post1 = new THREE.Mesh(postGeo, goalMat);
      post1.position.set(0, goalHeight / 2, -goalSpan / 2);
      post1.castShadow = true;
      goalGroup.add(post1);

      const post2 = new THREE.Mesh(postGeo, goalMat);
      post2.position.set(0, goalHeight / 2, goalSpan / 2);
      post2.castShadow = true;
      goalGroup.add(post2);

      // Crossbar
      const barGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalSpan, 16);
      const bar = new THREE.Mesh(barGeo, goalMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0, goalHeight, 0);
      bar.castShadow = true;
      goalGroup.add(bar);

      // Net box
      const netGeo = new THREE.BoxGeometry(goalDepth, goalHeight, goalSpan);
      const net = new THREE.Mesh(netGeo, netMat);
      net.position.set((xSide > 0 ? 1 : -1) * (goalDepth / 2), goalHeight / 2, 0);
      goalGroup.add(net);

      goalGroup.position.set(xSide * halfW, 0, 0);
      stadiumGroup.add(goalGroup);
    };

    createGoal(-1);
    createGoal(1);

    // 4. Stadium Floodlight Towers with Spotlights
    const lightTowerGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 8);
    const lightTowerMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
    const lampGeo = new THREE.BoxGeometry(0.8, 0.4, 0.5);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const cornerCoords = [
      { x: -pitchWidth / 2 - 0.5, z: -pitchLength / 2 - 0.5 },
      { x: pitchWidth / 2 + 0.5, z: -pitchLength / 2 - 0.5 },
      { x: -pitchWidth / 2 - 0.5, z: pitchLength / 2 + 0.5 },
      { x: pitchWidth / 2 + 0.5, z: pitchLength / 2 + 0.5 },
    ];

    cornerCoords.forEach((coord) => {
      const tower = new THREE.Mesh(lightTowerGeo, lightTowerMat);
      tower.position.set(coord.x, 3, coord.z);
      stadiumGroup.add(tower);

      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(coord.x, 6, coord.z);
      lamp.lookAt(0, 0, 0);
      stadiumGroup.add(lamp);

      const spotLight = new THREE.SpotLight(0xfffaed, 8, 35, Math.PI / 4, 0.5);
      spotLight.position.set(coord.x, 6, coord.z);
      spotLight.target.position.set(0, 0, 0);
      spotLight.castShadow = true;
      spotLight.shadow.mapSize.width = 512;
      spotLight.shadow.mapSize.height = 512;
      scene.add(spotLight);
      scene.add(spotLight.target);
    });

    // 5. 3D Soccer Ball
    const ballCanvas = document.createElement("canvas");
    ballCanvas.width = 256;
    ballCanvas.height = 256;
    const bCtx = ballCanvas.getContext("2d");
    if (bCtx) {
      bCtx.fillStyle = "#ffffff";
      bCtx.fillRect(0, 0, 256, 256);
      bCtx.fillStyle = "#0f172a";
      // Draw soccer pentagons
      const drawPentagon = (px: number, py: number, r: number) => {
        bCtx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const x = px + r * Math.cos(a);
          const y = py + r * Math.sin(a);
          if (i === 0) bCtx.moveTo(x, y);
          else bCtx.lineTo(x, y);
        }
        bCtx.closePath();
        bCtx.fill();
      };
      drawPentagon(64, 64, 26);
      drawPentagon(192, 64, 26);
      drawPentagon(64, 192, 26);
      drawPentagon(192, 192, 26);
      drawPentagon(128, 128, 30);
    }
    const ballTex = new THREE.CanvasTexture(ballCanvas);
    const ballGeo = new THREE.SphereGeometry(0.55, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({
      map: ballTex,
      roughness: 0.25,
      metalness: 0.1,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.position.set(0, 0.55, 0);
    ballMesh.castShadow = true;
    stadiumGroup.add(ballMesh);

    // Ball soft shadow
    const shadowGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
    });
    const ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.set(0, 0.025, 0);
    stadiumGroup.add(ballShadow);

    // Ambient and Hemisphere lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x064e3b, 1.0);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Interactive mouse / touch drag handlers
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      setIsInteracting(true);
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) {
        // Subtle tilt on hover
        const rect = container.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        rotationTargetRef.current.x = 0.55 + ny * 0.2;
        rotationTargetRef.current.y = 0.35 + nx * 0.4;
        return;
      }
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;
      rotationTargetRef.current.y += deltaX * 0.008;
      rotationTargetRef.current.x = Math.max(0.2, Math.min(1.1, rotationTargetRef.current.x + deltaY * 0.008));
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      setIsInteracting(false);
    };

    // Touch events for mobile
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        setIsInteracting(true);
        previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - previousMousePositionRef.current.x;
      const deltaY = e.touches[0].clientY - previousMousePositionRef.current.y;
      rotationTargetRef.current.y += deltaX * 0.01;
      rotationTargetRef.current.x = Math.max(0.2, Math.min(1.1, rotationTargetRef.current.x + deltaY * 0.01));
      previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
      setIsInteracting(false);
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth damped rotation towards target
      if (!isDraggingRef.current) {
        // Slow auto rotation around Y axis
        rotationTargetRef.current.y += 0.002;
      }
      stadiumGroup.rotation.y += (rotationTargetRef.current.y - stadiumGroup.rotation.y) * 0.06;
      stadiumGroup.rotation.x += (rotationTargetRef.current.x - stadiumGroup.rotation.x) * 0.06;

      // Ball animation: subtle bouncing and spin
      const bounceHeight = Math.abs(Math.sin(elapsedTime * 3)) * 0.8;
      ballMesh.position.y = 0.55 + bounceHeight;
      ballMesh.rotation.x += 0.02;
      ballMesh.rotation.y += 0.03;

      // Shadow scale and opacity according to height
      const shadowScale = 1 - bounceHeight * 0.4;
      ballShadow.scale.set(shadowScale, shadowScale, shadowScale);
      (ballShadow.material as THREE.MeshBasicMaterial).opacity = 0.4 - bounceHeight * 0.2;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);

      if (rendererRef.current && rendererRef.current.domElement) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, []);

  return (
    <div className="relative w-full aspect-square sm:aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border border-primary/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/80 group select-none">
      {/* 3D WebGL Canvas */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-300"
        title="Kéo chuột hoặc vuốt để xoay 3D sân bóng"
      />

      {/* Top Floating Badge */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-lg">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <Sparkles className="w-3.5 h-3.5" />
        <span>Sân Vận Động 3D Real-time</span>
      </div>

      {/* 3D Interaction Tooltip / Compass */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/70 backdrop-blur-md border border-white/10 text-white/80 text-xs font-medium pointer-events-none transition-opacity duration-300">
        <Compass className={`w-3.5 h-3.5 text-emerald-400 ${isInteracting ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">Chạm / Kéo để xoay 360°</span>
        <span className="sm:hidden">Xoay 3D</span>
      </div>

      {/* Bottom Info HUD Card */}
      <div className="absolute bottom-4 left-4 right-4 z-10 p-4 rounded-2xl bg-slate-900/85 backdrop-blur-xl border border-white/15 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center text-white font-bold shadow-md shadow-primary/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-white font-bold text-sm sm:text-base leading-tight">
                Hệ Thống Sân Tiêu Chuẩn FIFA
              </div>
              <div className="text-emerald-400 text-xs font-medium flex items-center gap-2 mt-0.5">
                <span>Cỏ nhân tạo cao cấp</span>
                <span>•</span>
                <span>Đèn LED chống chói 200W</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/60">Trạng thái</div>
            <div className="text-emerald-400 font-bold text-xs sm:text-sm flex items-center gap-1 justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sẵn sàng đặt
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
