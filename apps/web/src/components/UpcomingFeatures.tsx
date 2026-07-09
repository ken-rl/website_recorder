import React from "react";

interface Feature {
  id: string;
  title: string;
  description: string;
  status: "Planned" | "In Progress" | "Completed";
}

const INITIAL_FEATURES: Feature[] = [
  {
    id: "bezier-canvas",
    title: "Interactive Easing Curve Editor",
    description:
      "A drag-and-drop Bezier handle canvas allowing developers to visually map out custom speed curves and preview scroll acceleration in real-time.",
    status: "In Progress",
  },
  {
    id: "device-mockups",
    title: "Device Bezels & Custom Backgrounds",
    description:
      "Wrap captures in realistic device bezels (laptop, mobile, tablet) and customize backing pads with solid colors, sleek gradients, or custom assets.",
    status: "Planned",
  },
  {
    id: "pause-triggers-ui",
    title: "Capture-Time Pause Triggers (UI)",
    description:
      "Directly specify CSS selectors in the recorder UI to automatically pause scroll motion and hold frames when key elements enter the viewport.",
    status: "Planned",
  },
  {
    id: "timeline-zoom",
    title: "Timeline Zoom & Precise Editing",
    description:
      "Magnify the editor timeline for microsecond frame-accurate trim positioning, pause-hold adjustments, and keyframe zoom blocks.",
    status: "Planned",
  },
  {
    id: "speed-ramps",
    title: "Velocity Speed Ramps",
    description:
      "Select specific ranges on the editing timeline to dynamically slow down or speed up the scroll motion in post-processing.",
    status: "Planned",
  },
  {
    id: "motion-blur",
    title: "Scroll Motion Blur",
    description:
      "Apply directional motion blur filters to video frames proportional to the scroll velocity, mimicking realistic camera motion.",
    status: "Planned",
  },
  {
    id: "aspect-presets",
    title: "Social Aspect Ratio Presets",
    description:
      "One-click formatting templates to export videos in 16:9, 9:16, 1:1, or 4:5 aspect ratios, perfect for platforms like TikTok, Reels, or Stories.",
    status: "Planned",
  },
  {
    id: "transparent-webm",
    title: "Transparent WebM Export",
    description:
      "Export scroll captures with transparent backings, allowing video creators to drop recorders directly into Premiere or After Effects overlays.",
    status: "Planned",
  },
  {
    id: "react-component",
    title: "React Component Library Package",
    description:
      "An embeddable <WebRecorder /> React component that you can drop directly into developer dashboards, internal portals, or document showcases.",
    status: "Planned",
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
