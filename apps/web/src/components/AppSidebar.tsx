import React from "react";
import { Archive, ChevronLeft, ChevronRight, Columns2, Moon, ScanLine, Sun, MonitorSmartphone } from "lucide-react";

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
  const isLibrary = currentPath === "/library";
  const isCompare = currentPath === "/compare";
  const isResponsive = currentPath === "/responsive";

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
          title="Deio Scroll"
        >
          <img
            src="/deio-scroll-mark.svg"
            alt=""
            className="app-nav-logo"
            width={44}
            height={44}
            draggable={false}
          />
          {!collapsed && (
            <span className="app-nav-brand-text">
              <span className="app-nav-wordmark">
                <strong>Deio</strong>
                <small>Scroll</small>
              </span>
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
            <span className={`capture-nav-icon${isRecording ? " is-recording" : ""}`} aria-hidden="true">
              <ScanLine size={18} strokeWidth={1.8} />
              <i />
            </span>
            {!collapsed && <span>Capture</span>}
          </button>
          <button
            type="button"
            className={`app-nav-link${isCompare ? " is-active" : ""}`}
            onClick={() => onNavigate("/compare")}
            title="Compare"
          >
            <Columns2 size={18} strokeWidth={1.8} />
            {!collapsed && <span>Compare</span>}
          </button>
          <button
            type="button"
            className={`app-nav-link${isResponsive ? " is-active" : ""}`}
            onClick={() => onNavigate("/responsive")}
            title="Responsive"
          >
            <MonitorSmartphone size={18} strokeWidth={1.8} />
            {!collapsed && <span>Responsive</span>}
          </button>
          <button
            type="button"
            className={`app-nav-link${isLibrary ? " is-active" : ""}`}
            onClick={() => onNavigate("/library")}
            title="Library"
          >
            <Archive size={18} strokeWidth={1.8} />
            {!collapsed && <span>Library</span>}
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
