"use client";

/**
 * Kanvas tanda tangan, dipakai bersama layar tanda tangan klaim dan layar
 * pendaftaran spesimen.
 *
 * Dua salinan kanvas yang sama akan berbeda perilaku cepat atau lambat — dan
 * bedanya berupa goresan yang direkam dengan cara berbeda pada tahap pendaftaran
 * dan tahap pemakaian, sementara yang membandingkan keduanya adalah mesin yang
 * sama. Justru di sinilah duplikasi paling mahal.
 *
 * Titik direkam beserta waktunya: lapisan dinamis mesin pencocokan menilai irama
 * dan urutan goresan, bukan hanya bentuk akhirnya.
 */

import { useCallback, useEffect, useRef } from "react";

export type Stroke = { points: { x: number; y: number; t: number }[] };

export function usePadTtd() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const drawing = useRef(false);
  const t0 = useRef(0);
  const metode = useRef("mouse");

  const hapus = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
    strokes.current = [];
    current.current = null;
    t0.current = 0;
  }, []);

  /** Sesuaikan kanvas dengan ukuran tampilnya. Dipanggil saat kanvas muncul. */
  const siapkan = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    const c2d = cv.getContext("2d")!;
    c2d.scale(dpr, dpr);
    c2d.lineWidth = 2.4;
    c2d.lineCap = "round";
    c2d.lineJoin = "round";
    c2d.strokeStyle = "#15171A";
    hapus();
  }, [hapus]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const p = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if ("touches" in e) {
      metode.current =
        (e.touches[0] as any).touchType === "stylus" ? "stylus" : "finger";
    }
    drawing.current = true;
    if (!t0.current) t0.current = Date.now();
    const p = pos(e);
    current.current = { points: [{ x: p.x, y: p.y, t: 0 }] };
    const c2d = canvasRef.current!.getContext("2d")!;
    c2d.beginPath();
    c2d.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    current.current!.points.push({ x: p.x, y: p.y, t: Date.now() - t0.current });
    const c2d = canvasRef.current!.getContext("2d")!;
    c2d.lineTo(p.x, p.y);
    c2d.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current && current.current.points.length > 1) {
      strokes.current.push(current.current);
    }
    current.current = null;
  };

  return {
    canvasRef, siapkan, hapus,
    kosong: () => !strokes.current.length,
    dataUrl: () => canvasRef.current!.toDataURL("image/png"),
    goresan: () => strokes.current,
    metode: () => metode.current,
    bind: {
      ref: canvasRef,
      onMouseDown: start, onMouseMove: move, onMouseUp: end, onMouseLeave: end,
      onTouchStart: start, onTouchMove: move, onTouchEnd: end,
    },
  };
}

export type PadTtd = ReturnType<typeof usePadTtd>;

/** Kanvas itu sendiri. `tampil` menandai kapan ukurannya perlu disiapkan ulang. */
export function KanvasTtd(
  { pad, tampil = true, tinggi = 180 }:
  { pad: PadTtd; tampil?: boolean; tinggi?: number },
) {
  useEffect(() => { if (tampil) pad.siapkan(); }, [tampil, pad]);
  return (
    <canvas {...pad.bind}
            style={{ width: "100%", height: tinggi,
                     border: "1.5px dashed var(--sub)", background: "#FCFCFB",
                     touchAction: "none", display: "block" }} />
  );
}
