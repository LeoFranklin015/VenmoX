"use client";

import { useEffect, useRef, useCallback } from "react";

interface QRScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(true);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;

  const stopStream = useCallback(() => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    scanningRef.current = true;
    let animationId: number;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (!scanningRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve();
        });
        if (!scanningRef.current) return;
        await video.play();

        // Use BarcodeDetector if available, otherwise fall back to jsQR
        if ("BarcodeDetector" in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({
            formats: ["qr_code"],
          });

          const scan = async () => {
            if (!scanningRef.current) return;
            try {
              const barcodes = await detector.detect(video);
              if (barcodes.length > 0) {
                stopStream();
                onScanRef.current(barcodes[0].rawValue);
                return;
              }
            } catch {
              // detection frame failed, continue
            }
            animationId = requestAnimationFrame(scan);
          };
          animationId = requestAnimationFrame(scan);
        } else {
          const { default: jsQR } = await import("jsqr");
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;

          const scan = () => {
            if (!scanningRef.current) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, canvas.width, canvas.height);
              if (code) {
                stopStream();
                onScanRef.current(code.data);
                return;
              }
            }
            animationId = requestAnimationFrame(scan);
          };
          animationId = requestAnimationFrame(scan);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onErrorRef.current?.(msg);
      }
    }

    start();

    return () => {
      scanningRef.current = false;
      cancelAnimationFrame(animationId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [stopStream]);

  return (
    <video
      ref={videoRef}
      className="w-full rounded-2xl"
      playsInline
      muted
    />
  );
}
