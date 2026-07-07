import React from "react";
import { Sun, Moon } from "lucide-react";
import LordIcon from "./LordIcon";
import { LORDICON } from "../lib/icons";

interface AppTopbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isRecording?: boolean;
  hasEditorSession?: boolean;
  actions?: React.ReactNode;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function AppTopbar({
  currentPath,
  onNavigate,
  isRecording = false,
  hasEditorSession = false,
  actions,
  theme,
  onToggleTheme,
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
          colors={theme === "light" ? "primary:#090d16,secondary:#3e4e63" : "primary:#f4f4f5,secondary:#a1a1aa"}
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

      <div className="product-topbar-actions">
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          aria-label="Toggle Theme"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        {actions}
      </div>
    </header>
  );
}
