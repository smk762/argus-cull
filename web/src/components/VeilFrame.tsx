"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import type { FrameSource } from "@/lib/veil";

/**
 * A veiled frame: the mosaic, a frosted sheen, and optional detector boxes.
 * `source` is a veil (the tape's tiny file) or a mosaic (drawn here from the
 * thumbnail, which is never shown). `across` is how many cells span the box's
 * width, for the softening. Boxes are [x, y, w, h] fractions of the frame,
 * which fills the box (`fit="fill"`); a cover-fitted tile draws none.
 */
export function VeilFrame({
  source,
  across,
  fit,
  className = "",
  style,
  boxes = [],
  boxLabel,
}: {
  source: Extract<FrameSource, { kind: "veil" | "mosaic" }>;
  across: number;
  fit: "cover" | "fill";
  className?: string;
  style?: CSSProperties;
  boxes?: readonly [number, number, number, number][];
  boxLabel?: string;
}) {
  const fitClass = fit === "cover" ? "object-cover" : "object-fill";
  const vars = { ...style, "--veil-across": String(Math.max(1, across)) } as CSSProperties;
  return (
    <span className={`veil block ${className}`} style={vars}>
      {source.kind === "veil" ? (
        // A few dozen pixels, scaled up square-edged: next/image would only re-encode it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source.url} alt="" decoding="async" className={`veil-mosaic ${fitClass}`} />
      ) : (
        <MosaicCanvas from={source.from} cells={source.cells} className={`veil-mosaic ${fitClass}`} />
      )}
      <span className="veil-frost" aria-hidden="true" />
      {boxes.length > 0 && fit === "fill" ? (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label={boxLabel}>
          {boxes.map(([x, y, w, h], index) => (
            <g key={index}>
              <rect className="veil-box-halo" x={x} y={y} width={w} height={h} />
              <rect className="veil-box" x={x} y={y} width={w} height={h} />
            </g>
          ))}
        </svg>
      ) : null}
    </span>
  );
}

/**
 * The live page's mosaic: the thumbnail loads off-screen into an Image that is
 * never attached, and only its averaged cells are drawn. Halving steps keep the
 * average close to a box filter, as the recorder's veils are.
 */
function MosaicCanvas({ from, cells, className }: { from: string; cells: number; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const canvas = ref.current;
      if (!live || !canvas || image.naturalWidth === 0) return;
      const scale = cells / Math.max(image.naturalWidth, image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      let source: CanvasImageSource = image;
      let sw = image.naturalWidth;
      let sh = image.naturalHeight;
      while (sw / 2 >= width * 2 && sh / 2 >= height * 2) {
        const step = document.createElement("canvas");
        step.width = Math.round(sw / 2);
        step.height = Math.round(sh / 2);
        const context = step.getContext("2d");
        if (!context) break;
        context.imageSmoothingQuality = "high";
        context.drawImage(source, 0, 0, step.width, step.height);
        source = step;
        sw = step.width;
        sh = step.height;
      }
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, width, height);
    };
    image.src = from;
    return () => {
      live = false;
      image.onload = null;
    };
  }, [from, cells]);
  return <canvas ref={ref} width={1} height={1} className={className} aria-hidden="true" />;
}

/** Cells across the box: a cover-fitted square shows the short side's cells, a filled box the width's. */
export function cellsAcross(cells: number, width: number, height: number, fit: "cover" | "fill"): number {
  if (!(width > 0 && height > 0)) return cells;
  const long = Math.max(width, height);
  return fit === "cover" ? (cells * Math.min(width, height)) / long : (cells * width) / long;
}
