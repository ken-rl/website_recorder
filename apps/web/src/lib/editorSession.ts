export interface EditorSession {
  jobId: string;
  sourceUrl: string;
  targetUrl: string;
  width: number;
  height: number;
  scrollStrategy?: "document" | "virtual";
}

const STORAGE_KEY = "websiterecorder.editorSession";

export function saveEditorSession(session: EditorSession) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadEditorSession(): EditorSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as EditorSession;
    if (!parsed.jobId || !parsed.sourceUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearEditorSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}
