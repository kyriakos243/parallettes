import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { MotionGuide } from "./MotionGuide";
import type { Exercise } from "./program";

type Props = {
  exercise: Exercise;
  compact?: boolean;
  dimmed?: boolean;
};

const extension = (source: string) => source.split("?")[0].split(".").pop()?.toLowerCase();

export function ExerciseDemo({ exercise, compact = false, dimmed = false }: Props) {
  const [sourceFailed, setSourceFailed] = useState(false);
  const { media } = exercise;

  useEffect(() => setSourceFailed(false), [exercise.id, media.src]);

  const visualClass = `exercise-demo ${dimmed ? "demo-dimmed" : ""}`;
  const fileType = media.src ? extension(media.src) : undefined;

  if (media.motion) {
    return (
      <div className={`${visualClass} exercise-demo-motion`}>
        <MotionGuide preset={media.motion} compact={compact} />
      </div>
    );
  }

  if (media.src && !sourceFailed && (fileType === "mp4" || fileType === "webm")) {
    return (
      <div className={`${visualClass} exercise-demo-video`}>
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
      <div className={`${visualClass} exercise-demo-gif`}>
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
    <div className={`${visualClass} demo-unavailable`} role="img" aria-label={`${exercise.name} visual unavailable`}>
      <RefreshCw />
      <strong>Technique guide unavailable</strong>
      <span>Use the written cues and choose a swap if needed.</span>
    </div>
  );
}
