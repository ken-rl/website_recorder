import React from "react";
import LordIcon from "./LordIcon";
import { LORDICON } from "../lib/icons";

interface AppTopbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isRecording?: boolean;
  hasEditorSession?: boolean;
  actions?: React.ReactNode;
}

export default function AppTopbar({
  currentPath,
  onNavigate,
  isRecording = false,
  hasEditorSession = false,
  actions,
}: AppTopbarProps) {
  const isRecorder = currentPath === "/" || currentPath === "";
  const isEditor = currentPath === "/editor";
  const isRoadmap = currentPath === "/upcoming";

  return (
    <header className="app-header product-topbar">
      <button
        type="button"
        className="product-brand"
        onClick={() => onNavigate("/")}
      >
        <LordIcon
          src={LORDICON.logo}
          size={26}
          trigger={isRecording ? "loop" : "hover"}
          colors="primary:#f4f4f5,secondary:#a1a1aa"
        />
        <span className="product-brand-text">
          <strong>Website Recorder</strong>
          {isRecording && <span className="product-brand-live">Recording</span>}
        </span>
      </button>

      <nav className="header-nav product-nav">
        <button
          type="button"
          className={`nav-link product-nav-link${isRecorder ? " active" : ""}`}
          onClick={() => onNavigate("/")}
        >
          <LordIcon
            src={LORDICON.recorder}
            size={18}
            trigger={isRecorder ? "loop" : "hover"}
          />
          Recorder
        </button>
        <button
          type="button"
          className={`nav-link product-nav-link${isEditor ? " active" : ""}`}
          onClick={() => hasEditorSession && onNavigate("/editor")}
          disabled={!hasEditorSession}
          title={
            hasEditorSession
              ? "Editor"
              : "Record a capture first, then open in editor"
          }
        >
          <LordIcon
            src={LORDICON.editor}
            size={18}
            trigger={isEditor ? "loop" : "hover"}
          />
          Editor
        </button>
        <button
          type="button"
          className={`nav-link product-nav-link${isRoadmap ? " active" : ""}`}
          onClick={() => onNavigate("/upcoming")}
        >
          <LordIcon
            src={LORDICON.roadmap}
            size={18}
            trigger={isRoadmap ? "loop" : "hover"}
          />
          Roadmap
        </button>
      </nav>

      <div className="product-topbar-actions">{actions}</div>
    </header>
  );
}
