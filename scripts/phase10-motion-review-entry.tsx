import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Phase10MediaAuditPage } from "../app/vnext/media/Phase10MediaAuditPage";
import "../app/vnext/releaseCandidate/phase9.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Motion-review root is unavailable");
rootElement.dataset.p25BuildLane = "p25-build-lane:vnext-rc3-motion-review";

createRoot(rootElement).render(
  <StrictMode>
    <Phase10MediaAuditPage />
  </StrictMode>,
);
