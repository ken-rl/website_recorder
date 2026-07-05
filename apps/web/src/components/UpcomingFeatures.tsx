import React from "react";

interface Feature {
  id: string;
  title: string;
  description: string;
  status: "Planned" | "In Progress" | "Completed";
}

const INITIAL_FEATURES: Feature[] = [
  {
    id: "react-component",
    title: "React Component Library Package",
    description:
      "An embeddable <WebRecorder /> React component that you can drop directly into developer dashboards, internal portals, or document showcases.",
    status: "Planned",
  },
  {
    id: "deterministic-caching",
    title: "Deterministic Server-Side Caching",
    description:
      "Eliminate repetitive browser hydrates and ffmpeg runs. Hashes your config inputs to serve identical requests in milliseconds.",
    status: "Planned",
  },
  {
    id: "bezier-canvas",
    title: "Interactive Easing Curve Editor",
    description:
      "A drag-and-drop Bezier handle canvas allowing developers to visually map out custom speed curves and preview scroll acceleration in real-time.",
    status: "In Progress",
  },
];

export default function UpcomingFeatures() {
  return (
    <div className="upcoming-container animate-fade-in">
      <div className="roadmap-header-minimal">
        <h2>Roadmap</h2>
        <p className="roadmap-desc-minimal">
          Proposed features and active developments.
        </p>
      </div>

      <div className="features-list-minimal">
        {INITIAL_FEATURES.map((feature) => (
          <div key={feature.id} className="feature-row-minimal">
            <div className="feature-info-minimal">
              <div className="feature-meta-minimal">
                <span
                  className={`status-dot status-dot-${feature.status.toLowerCase().replace(/\s+/g, "")}`}
                />
                <span className="status-text-minimal">{feature.status}</span>
              </div>
              <h3 className="feature-title-minimal">{feature.title}</h3>
              <p className="feature-desc-minimal">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
