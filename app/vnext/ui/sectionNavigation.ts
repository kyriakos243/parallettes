import { useLayoutEffect, useRef, useState } from "react";

export type TrainingSection = "today" | "progress" | "history";

/** Browsing-only memory. It never stores workout, account or evidence state. */
export const useSectionNavigation = (initial: TrainingSection) => {
  const [section, setSection] = useState<TrainingSection>(initial);
  const visited = useRef(new Set<TrainingSection>([initial]));
  const positions = useRef<Partial<Record<TrainingSection, number>>>({});
  const restorePending = useRef(false);
  const changeSection = (next: TrainingSection) => {
    if (next === section) return;
    positions.current[section] = window.scrollY;
    visited.current.add(next);
    restorePending.current = true;
    setSection(next);
  };
  useLayoutEffect(() => {
    if (!restorePending.current) return;
    restorePending.current = false;
    window.scrollTo({ top: positions.current[section] ?? 0, left: 0, behavior: "instant" });
  }, [section]);
  return { section, changeSection, hasVisited: (value: TrainingSection) => visited.current.has(value) };
};
