import React from "react";
import { ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import LordIcon from "./LordIcon";
import { LORDICON } from "../lib/icons";

interface AppSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isRecording?: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function AppSidebar({
  currentPath,
  onNavigate,
  isRecording = false,
  theme,
  onToggleTheme,
  collapsed,
  onToggleCollapsed,
}: AppSidebarProps) {
  const isRecorder = currentPath === "/" || currentPath === "";
  const isRoadmap = currentPath === "/upcoming";

  return (
    <aside
      className={`app-nav-sidebar${collapsed ? " is-collapsed" : ""}`}
      aria-label="Main navigation"
    >
      <div className="app-nav-top">
        <button
          type="button"
          className="app-nav-brand"
          onClick={() => onNavigate("/")}
          title="Scrollizard"
        >
          <img
            src="/scrollizard-mark.png"
            alt=""
            className="app-nav-logo"
            width={44}
            height={44}
            draggable={false}
          />
          {!collapsed && (
            <span className="app-nav-brand-text">
              <strong>Scrollizard</strong>
              {isRecording && (
                <span className="app-nav-live">Recording</span>
              )}
            </span>
          )}
        </button>

        <nav className="app-nav-links">
          <button
            type="button"
            className={`app-nav-link${isRecorder ? " is-active" : ""}`}
            onClick={() => onNavigate("/")}
            title="Capture"
          >
            <LordIcon
              src={LORDICON.recorder}
              size={18}
              trigger={isRecorder ? "loop" : "hover"}
            />
            {!collapsed && <span>Capture</span>}
          </button>
          <button
            type="button"
            className={`app-nav-link${isRoadmap ? " is-active" : ""}`}
            onClick={() => onNavigate("/upcoming")}
            title="Roadmap"
          >
            <LordIcon
              src={LORDICON.roadmap}
              size={18}
              trigger={isRoadmap ? "loop" : "hover"}
            />
            {!collapsed && <span>Roadmap</span>}
          </button>
        </nav>
      </div>

      <div className="app-nav-bottom">
        <button
          type="button"
          className="app-nav-link"
          onClick={onToggleTheme}
          title={theme === "light" ? "Dark mode" : "Light mode"}
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          {!collapsed && <span>{theme === "light" ? "Dark" : "Light"}</span>}
        </button>
        <button
          type="button"
          className="app-nav-link app-nav-collapse"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
