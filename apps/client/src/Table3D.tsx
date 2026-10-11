import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrientedTile } from "../../../packages/rules/src/index.ts";

function drawPips(context: CanvasRenderingContext2D, value: number, xOffset: number) {
  const positions: Record<number, Array<[number, number]>> = {
    0: [], 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]],
    4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]],
    6: [[.27, .22], [.73, .22], [.27, .5], [.73, .5], [.27, .78], [.73, .78]],
  };
  context.fillStyle = "#12201d";
  for (const [x, y] of positions[value]!) {
    context.beginPath(); context.arc(xOffset + x * 128, y * 128, 9, 0, Math.PI * 2); context.fill();
  }
}

function tileTexture(left: number, right: number) {
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f3eedf"; context.fillRect(0, 0, 256, 128);
  context.strokeStyle = "#847d69"; context.lineWidth = 3; context.beginPath(); context.moveTo(128, 14); context.lineTo(128, 114); context.stroke();
  drawPips(context, left, 0); drawPips(context, right, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function positionFor(index: number): { x: number; z: number; rotation: number } {
  const perRow = 7;
  const row = Math.floor(index / perRow);
  const column = index % perRow;
  const direction = row % 2 === 0 ? 1 : -1;
  return { x: direction * (column - 3) * 1.38, z: (row - 1.25) * 1.45, rotation: direction === 1 ? 0 : Math.PI };
}

export function Table3D({ chain, reducedMotion }: { chain: readonly OrientedTile[]; reducedMotion: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    const element = host.current; if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setUnsupported(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 100); camera.position.set(0, 9.5, 9.8); camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xfff3d4, 0x063128, 2.2));
    const key = new THREE.DirectionalLight(0xffe8ae, 3.2); key.position.set(-4, 9, 5); key.castShadow = true; scene.add(key);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, .42, 64), new THREE.MeshStandardMaterial({ color: 0x0c5b4c, roughness: .88, metalness: .05 }));
    table.position.y = -.32; table.receiveShadow = true; scene.add(table);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.12, .16, 12, 64), new THREE.MeshStandardMaterial({ color: 0x8e582e, roughness: .55 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = -.05; scene.add(rim);
    const textures: THREE.Texture[] = [];
    chain.forEach((tile, index) => {
      const texture = tileTexture(tile.left, tile.right); textures.push(texture);
      const materials = [
        new THREE.MeshStandardMaterial({ color: 0xc9c1ae }), new THREE.MeshStandardMaterial({ color: 0xc9c1ae }),
        new THREE.MeshStandardMaterial({ map: texture, roughness: .68 }), new THREE.MeshStandardMaterial({ color: 0xa69d88 }),
        new THREE.MeshStandardMaterial({ color: 0xc9c1ae }), new THREE.MeshStandardMaterial({ color: 0xc9c1ae }),
      ];
      const domino = new THREE.Mesh(new THREE.BoxGeometry(1.25, .22, .64), materials);
      const position = positionFor(index); domino.position.set(position.x, .02, position.z); domino.rotation.y = position.rotation;
      domino.castShadow = true; domino.receiveShadow = true; scene.add(domino);
    });
    const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); renderer.render(scene, camera); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    let frame = 0;
    const render = () => { renderer.render(scene, camera); if (!reducedMotion) { scene.rotation.y = Math.sin(performance.now() / 9000) * .035; frame = requestAnimationFrame(render); } };
    render();
    return () => {
      observer.disconnect(); if (frame) cancelAnimationFrame(frame); renderer.dispose(); renderer.domElement.remove();
      scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()); } });
      textures.forEach((texture) => texture.dispose());
    };
  }, [chain, reducedMotion]);
  return <div className="three-stage" ref={host} aria-label={`Mesa 3D con ${chain.length} fichas`}>
    {chain.length === 0 && <p>El poseedor de 6–6 abre la ronda</p>}
    {unsupported && <p>WebGL no disponible. Usa la descripción accesible de la cadena.</p>}
    <ol className="sr-only">{chain.map((tile, index) => <li key={`${tile.id}-${index}`}>{tile.left}–{tile.right}</li>)}</ol>
  </div>;
}
