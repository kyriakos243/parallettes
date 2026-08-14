import { RefreshCw } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { MotionPreset } from "./MotionGuide";
import type { Exercise } from "./program";

type Props = {
  exercise: Exercise;
  compact?: boolean;
  dimmed?: boolean;
  /**
   * Unmount motion/video/image content while it is well outside the viewport.
   * Compact lists opt in by default; active, non-compact player demos never wait.
   */
  deferOffscreen?: boolean;
};

const MotionGuide = lazy(async () => ({ default: (await import("./MotionGuide")).MotionGuide }));

const extension = (source: string) => source.split("?")[0].split(".").pop()?.toLowerCase();

export function ExerciseDemo({ exercise, compact = false, dimmed = false, deferOffscreen }: Props) {
  const [sourceFailed, setSourceFailed] = useState(false);
  const shouldDefer = deferOffscreen ?? compact;
  const [nearViewport, setNearViewport] = useState(!shouldDefer);
  const containerRef = useRef<HTMLDivElement>(null);
  const { media } = exercise;

  useEffect(() => setSourceFailed(false), [exercise.id, media.src]);

  useEffect(() => {
    if (!shouldDefer) {
      setNearViewport(true);
      return;
    }

    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry?.isIntersecting === true),
      { rootMargin: "240px 0px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [exercise.id, shouldDefer]);

  const visualClass = `exercise-demo ${dimmed ? "demo-dimmed" : ""}`;
  const fileType = media.src ? extension(media.src) : undefined;
  const mediaClass = media.motion
    ? "exercise-demo-motion"
    : media.src && (fileType === "mp4" || fileType === "webm")
      ? "exercise-demo-video"
      : media.src
        ? "exercise-demo-gif"
        : "demo-unavailable";

  if (!nearViewport) {
    return (
      <div
        ref={containerRef}
        className={`${visualClass} ${mediaClass}`}
        role="img"
        aria-label={`${exercise.name} technique demonstration loads when near the viewport`}
      >
        <div className="motion-loading" aria-hidden="true" />
      </div>
    );
  }

  if (media.motion) {
    return (
      <div ref={containerRef} className={`${visualClass} exercise-demo-motion`}>
        <Suspense fallback={<div className="motion-loading" aria-label="Loading exercise guide" />}>
          <MotionGuide preset={media.motion as MotionPreset} compact={compact} />
        </Suspense>
      </div>
    );
  }

  if (media.src && !sourceFailed && (fileType === "mp4" || fileType === "webm")) {
    return (
      <div ref={containerRef} className={`${visualClass} exercise-demo-video`}>
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-label={`${exercise.name} continuous demonstration`}
          onError={() => setSourceFailed(true)}
        >
          <source src={media.src} type={fileType === "webm" ? "video/webm" : "video/mp4"} />
        </video>
        {!compact && <span className="loop-pill"><RefreshCw /> continuous guide</span>}
      </div>
    );
  }

  if (media.src && !sourceFailed) {
    return (
      <div ref={containerRef} className={`${visualClass} exercise-demo-gif`}>
        <img
          src={media.src}
          alt={`${exercise.name} technique demonstration`}
          loading={compact ? "lazy" : "eager"}
          onError={() => setSourceFailed(true)}
        />
        {!compact && (
          <span className="loop-pill">
            {media.kind === "static" ? "key position" : <><RefreshCw /> continuous guide</>}
          </span>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${visualClass} demo-unavailable`} role="img" aria-label={`${exercise.name} visual unavailable`}>
      <RefreshCw />
      <strong>Technique guide unavailable</strong>
      <span>Use the written cues and choose a swap if needed.</span>
    </div>
  );
}
