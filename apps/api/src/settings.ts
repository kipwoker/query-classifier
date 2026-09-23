import { setLayaUrl, getLayaUrl } from "@query-classifier/laya-client";
import { setOllamaUrl, setOllamaModel, getOllamaConfig } from "@query-classifier/llm-client";

// Persisted so a restart doesn't silently fall back to env-var defaults
// out from under whatever the settings panel last saved. Gitignored -
// this is runtime/local machine state, not project config.
const SETTINGS_PATH = new URL("../.runtime-settings.json", import.meta.url);

export interface Settings {
  layaUrl: string;
  ollamaUrl: string;
  ollamaModel: string;
}

function currentSettings(): Settings {
  const ollama = getOllamaConfig();
  return { layaUrl: getLayaUrl(), ollamaUrl: ollama.url, ollamaModel: ollama.model };
}

// Applies whatever was loaded/saved onto the actual client modules -
// getSettings() below just mirrors their current state back out, so this
// is the only place that pushes a value INTO laya-client/llm-client.
function apply(settings: Partial<Settings>): void {
  if (settings.layaUrl) setLayaUrl(settings.layaUrl);
  if (settings.ollamaUrl) setOllamaUrl(settings.ollamaUrl);
  if (settings.ollamaModel) setOllamaModel(settings.ollamaModel);
}

export async function loadSettings(): Promise<void> {
  try {
    const saved = (await Bun.file(SETTINGS_PATH).json()) as Partial<Settings>;
    apply(saved);
  } catch {
    // No saved file yet, or it's unreadable - fall back to the env-var
    // defaults laya-client/llm-client already initialized with.
  }
}

export function getSettings(): Settings {
  return currentSettings();
}

export async function updateSettings(partial: Partial<Settings>): Promise<Settings> {
  apply(partial);
  await Bun.write(SETTINGS_PATH, JSON.stringify(currentSettings(), null, 2));
  return currentSettings();
}

async function pingOk(url: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkStatus(): Promise<{ laya: boolean; ollama: boolean; ready: boolean }> {
  const s = currentSettings();
  const [laya, ollama] = await Promise.all([pingOk(s.layaUrl, "/health"), pingOk(s.ollamaUrl, "/api/tags")]);
  return { laya, ollama, ready: laya && ollama };
}

export async function listOllamaModels(url: string): Promise<string[]> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}
