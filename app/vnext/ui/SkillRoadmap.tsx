import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GraphId, NodeId } from "../contracts";
import type { RoadmapBenchmark, RoadmapNode, SkillRoadmapPresentation } from "../presentation";
import "./roadmap.css";

type Location = { graphId: GraphId; nodeId?: NodeId };

const evidenceIcon = (node: RoadmapNode): string => node.evidence === "confirmed" ? "✓"
  : node.evidence === "covered" ? "↗"
    : node.current || node.evidence === "developing" ? "●"
      : node.evidence === "demonstrated" ? "◐" : "○";

const BenchmarkDetails = ({ benchmarks, title }: Readonly<{ benchmarks: readonly RoadmapBenchmark[]; title: string }>) =>
  <details className="vnext-roadmap-benchmarks">
    <summary>{title}</summary>
    {benchmarks.map((benchmark, index) => <div key={`${benchmark.label}:${index}`}>
      <h5>{benchmark.label}</h5><p><strong>{benchmark.target}</strong></p>
      <p>{benchmark.conditions}</p><p>{benchmark.confirmation}</p>
      <ul>{benchmark.quality.map((item) => <li key={item}>{item}</li>)}</ul>
      <h5>Safety and control</h5><ul>{benchmark.safety.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>)}
  </details>;

const RoadmapTree = ({ roadmap, initialNode, onFollow }: Readonly<{
  roadmap: SkillRoadmapPresentation;
  initialNode?: NodeId;
  onFollow: (location: Location, from: NodeId) => void;
}>) => {
  const [selectedId, setSelectedId] = useState<NodeId | undefined>(initialNode);
  const [showSpecialist, setShowSpecialist] = useState(Boolean(roadmap.nodes.find((node) => node.id === initialNode)?.specialist));
  const canvas = useRef<HTMLDivElement>(null);
  const nodeElements = useRef(new Map<NodeId, HTMLButtonElement>());
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const markerId = useId().replaceAll(":", "");
  const [lines, setLines] = useState<readonly { key: string; path: string; optional: boolean; highlighted: boolean }[]>([]);
  const selected = roadmap.nodes.find((node) => node.id === selectedId);
  const visibleNodes = useMemo(() => roadmap.nodes.filter((node) => showSpecialist || !node.specialist), [roadmap.nodes, showSpecialist]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const levels = roadmap.levels.map((level) => level.filter((id) => visibleIds.has(id))).filter((level) => level.length);
  const highlighted = useMemo(() => {
    const result = new Set<NodeId>();
    const visit = (id: NodeId) => {
      if (result.has(id)) return;
      result.add(id);
      roadmap.edges.filter((edge) => edge.to === id).forEach((edge) => visit(edge.from));
    };
    if (selectedId) visit(selectedId);
    return result;
  }, [roadmap.edges, selectedId]);

  useEffect(() => {
    const container = canvas.current;
    if (!container) return;
    let frame = 0;
    const measure = () => {
      const box = container.getBoundingClientRect();
      setLines(roadmap.edges.flatMap((edge) => {
        if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return [];
        const start = nodeElements.current.get(edge.from)?.getBoundingClientRect();
        const end = nodeElements.current.get(edge.to)?.getBoundingClientRect();
        if (!start || !end) return [];
        const x1 = start.left - box.left + start.width / 2;
        const y1 = start.bottom - box.top;
        const x2 = end.left - box.left + end.width / 2;
        const y2 = end.top - box.top - 4;
        return [{
          key: `${edge.from}:${edge.to}:${edge.requirement}`,
          path: `M ${x1} ${y1} C ${x1} ${y1 + 22}, ${x2} ${y2 - 22}, ${x2} ${y2}`,
          optional: edge.requirement === "one-of",
          highlighted: highlighted.has(edge.from) && highlighted.has(edge.to),
        }];
      }));
    };
    const queue = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(queue);
    observer.observe(container);
    nodeElements.current.forEach((element) => observer.observe(element));
    queue();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [roadmap.edges, visibleIds, highlighted]);

  useEffect(() => {
    if (selectedId) {
      detailsHeading.current?.focus({ preventScroll: true });
      detailsHeading.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId]);

  const jumpTo = (node?: RoadmapNode) => {
    if (!node) return;
    nodeElements.current.get(node.id)?.focus({ preventScroll: true });
    nodeElements.current.get(node.id)?.scrollIntoView({ block: "center" });
  };
  const current = visibleNodes.find((node) => node.current) ?? visibleNodes.find((node) => node.next)
    ?? visibleNodes.find((node) => node.evidence !== "unknown") ?? visibleNodes[0];

  const renderRequirementGroup = (kind: "required" | "one-of") => {
    const requirements = selected?.requirements.filter((item) => item.requirement === kind) ?? [];
    if (!requirements.length) return null;
    return <div className="vnext-roadmap-requirement-group">
      <h5>{kind === "required" ? "Build all of these" : "One of these routes is enough"}</h5>
      <ul>
        {requirements.map((item) => <li key={item.key}>
          <span className="vnext-roadmap-requirement-status" data-state={item.state} aria-hidden="true">{item.state === "met" ? "✓" : "○"}</span>
          <div>
            <strong>{item.label}</strong>
            <p>{item.message}</p>
            {item.milestone && <button type="button" className="vnext-roadmap-link" onClick={() => {
              if (!item.milestone) return;
              if (item.milestone.graphId === roadmap.graphId) setSelectedId(item.milestone.nodeId);
              else if (selected) onFollow({ graphId: item.milestone.graphId, nodeId: item.milestone.nodeId }, selected.id);
            }}>{item.milestone.graphId === roadmap.graphId ? "View this step" : `View ${item.familyLabel} path`} <span aria-hidden="true">↗</span></button>}
            {item.benchmarks?.length ? <BenchmarkDetails benchmarks={item.benchmarks} title="How to confirm this requirement" /> : null}
          </div>
        </li>)}
      </ul>
    </div>;
  };

  return <>
    <div className="vnext-roadmap-position">
      <div><span>Where you are</span><strong>{roadmap.currentSummary}</strong></div>
      <div><span>Next focus</span><strong>{roadmap.nextSummary}</strong></div>
    </div>
    {roadmap.availability.state !== "available" && <p className="vnext-authority">{roadmap.availability.label}: {roadmap.availability.message}</p>}
    <div className="vnext-roadmap-tools">
      <button type="button" className="vnext-chip" onClick={() => jumpTo(current)}>Find my current step</button>
      <button type="button" className="vnext-chip" onClick={() => jumpTo([...visibleNodes].reverse().find((node) => node.branchGoal))}>See later milestones</button>
    </div>
    <p className="vnext-roadmap-key"><span>✓ Confirmed</span><span>● Current work</span><span>○ Still to build</span></p>
    <p className="vnext-help">Follow the connections from top to bottom. Tap a skill for its requirements and confirmation target. Dashed connections show alternative routes.</p>
    <div ref={canvas} className="vnext-roadmap-tree" aria-label={`${roadmap.label} skill tree`}>
      <svg className="vnext-roadmap-connections" aria-hidden="true">
        <defs><marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6" fill="none" stroke="currentColor" /></marker></defs>
        {lines.map((line) => <path key={line.key} d={line.path} data-highlighted={line.highlighted} strokeDasharray={line.optional ? "5 5" : undefined} markerEnd={`url(#${markerId})`} />)}
      </svg>
      {levels.map((level) => <div className="vnext-roadmap-level" key={level.join(":")}>
        <div className="vnext-roadmap-row" style={{ gridTemplateColumns: `repeat(${Math.min(level.length, 3)}, minmax(0, 1fr))` }}>
          {level.map((id) => {
            const node = roadmap.nodes.find((item) => item.id === id)!;
            return <button
              type="button" key={id}
              ref={(element) => { if (element) nodeElements.current.set(id, element); else nodeElements.current.delete(id); }}
              className="vnext-roadmap-node" data-evidence={node.evidence} data-current={node.current || node.next}
              data-path={highlighted.has(id)} aria-expanded={selectedId === id}
              aria-controls={selectedId === id ? `${markerId}-detail` : undefined}
              onClick={() => setSelectedId(selectedId === id ? undefined : id)}
            >
              <span className="vnext-roadmap-node-meta">{node.branch}</span>
              <strong>{node.label}</strong>
              <span className="vnext-roadmap-node-status"><i aria-hidden="true">{evidenceIcon(node)}</i>{node.evidenceLabel}</span>
              {(node.current || node.next) && <span className="vnext-roadmap-marker">{node.current ? "Current step" : "Next focus"}</span>}
              {node.recheck && <span className="vnext-roadmap-recheck">Recheck due · achievement kept</span>}
              {node.specialist ? <span className="vnext-roadmap-node-meta">Optional specialist</span>
                : node.branchGoal && <span className="vnext-roadmap-node-meta">Branch milestone</span>}
            </button>;
          })}
        </div>
        {selected && level.includes(selected.id) && <section className="vnext-roadmap-detail" id={`${markerId}-detail`} aria-labelledby={`${markerId}-detail-heading`}>
          <div className="vnext-roadmap-detail-heading">
            <div><p className="vnext-kicker">{selected.tier} · {selected.branch}</p><h4 ref={detailsHeading} tabIndex={-1} id={`${markerId}-detail-heading`}>{selected.label}</h4></div>
            <button type="button" className="vnext-chip" aria-label={`Close ${selected.label} details`} onClick={() => {
              nodeElements.current.get(selected.id)?.focus(); setSelectedId(undefined);
            }}>Close</button>
          </div>
          <p>{selected.description}</p>
          <p><strong>{selected.evidenceLabel}.</strong> {selected.evidenceMessage}</p>
          {selected.recheck && <p className="vnext-roadmap-recheck">A fresh check is needed before treating this skill as current. Your achievement is preserved.</p>}
          {renderRequirementGroup("required")}
          {renderRequirementGroup("one-of")}
          {!selected.requirements.length && <p className="vnext-help">This is a foundation step with no earlier skill milestone required.</p>}
          {selected.benchmarks.length > 0 && <BenchmarkDetails benchmarks={selected.benchmarks} title="What confirms this skill?" />}
          <p className="vnext-authority">{selected.trainingNote}</p>
        </section>}
      </div>)}
    </div>
    {roadmap.nodes.some((node) => node.specialist) && <div className="vnext-roadmap-specialist">
      <button type="button" className="vnext-chip" aria-expanded={showSpecialist} onClick={() => {
        if (showSpecialist && selected?.specialist) setSelectedId(undefined);
        setShowSpecialist(!showSpecialist);
      }}>{showSpecialist ? "Hide optional specialist branches" : "Explore optional specialist branches"}</button>
      <p>These are separate ambitions beyond the main paths. Opening the map does not opt you into specialist training.</p>
    </div>}
    <p className="vnext-help">Skills can develop along several branches at once. A family has several milestones, rather than one universal “mastered” level.</p>
  </>;
};

export const SkillRoadmap = ({ roadmaps }: Readonly<{ roadmaps: readonly SkillRoadmapPresentation[] }>) => {
  const goals = roadmaps.filter((map) => map.priority).sort((a, b) => (a.priority === "primary" ? 0 : 1) - (b.priority === "primary" ? 0 : 1));
  const [location, setLocation] = useState<Location>();
  const [trail, setTrail] = useState<Location[]>([]);
  const roadmap = roadmaps.find((map) => map.graphId === location?.graphId) ?? goals[0] ?? roadmaps[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const goalSignature = goals.map((map) => `${map.graphId}:${map.priority}`).join("|");
  useEffect(() => { setLocation(undefined); setTrail([]); }, [goalSignature]);
  if (!roadmap) return null;
  const open = (next: Location) => {
    setLocation(next);
    heading.current?.scrollIntoView({ block: "start" });
  };
  return <section className="vnext-roadmap" aria-labelledby="vnext-roadmap-heading">
    <div className="vnext-section-heading">
      <p className="vnext-kicker">Your path forward</p>
      <h2 id="vnext-roadmap-heading" ref={heading}>Your skill roadmap</h2>
      <p>See the path from your starting point to advanced skills, with the foundations that connect them.</p>
    </div>
    {goals.length > 0 ? <div className="vnext-roadmap-goals" aria-label="Your goal roadmaps">
      {goals.map((map) => <button type="button" key={map.graphId} aria-pressed={map.graphId === roadmap.graphId} onClick={() => { setTrail([]); open({ graphId: map.graphId }); }}>
        <span>{map.priority === "primary" ? "Main goal" : "Supporting goal"}</span><strong>{map.label}</strong>
      </button>)}
    </div> : <p className="vnext-help">Choose your main and supporting goals above to keep their roadmaps here.</p>}
    <label className="vnext-roadmap-explore">Explore a skill family
      <select value={roadmap.graphId} onChange={(event) => { setTrail([]); open({ graphId: event.target.value as GraphId }); }}>
        {roadmaps.map((map) => <option key={map.graphId} value={map.graphId}>{map.label}{map.priority ? ` · ${map.priority === "primary" ? "Main goal" : "Supporting goal"}` : ""}</option>)}
      </select>
    </label>
    {trail.length > 0 && <button type="button" className="vnext-back" onClick={() => { const previous = trail[trail.length - 1]; setTrail(trail.slice(0, -1)); open(previous); }}>
      ← Back to {roadmaps.find((map) => map.graphId === trail[trail.length - 1].graphId)?.label}
    </button>}
    <h3 className="vnext-roadmap-family-heading">{roadmap.label}</h3>
    <RoadmapTree key={`${roadmap.graphId}:${location?.nodeId ?? ""}`} roadmap={roadmap} initialNode={location?.nodeId} onFollow={(next, from) => {
      setTrail([...trail, { graphId: roadmap.graphId, nodeId: from }]); open(next);
    }} />
  </section>;
};
