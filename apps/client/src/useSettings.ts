import { useCallback, useEffect, useState } from "react";
import type { Settings, SettingsStatus } from "./types";

const STATUS_POLL_MS = 15_000;

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const refreshStatus = useCallback(() => {
    fetch("/api/settings/status")
      .then((r) => r.json() as Promise<SettingsStatus>)
      .then(setStatus)
      .catch(() => setStatus({ laya: false, ollama: false, ready: false }));
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json() as Promise<Settings>)
      .then(setSettings)
      .catch(() => {});
    refreshStatus();
    const interval = setInterval(refreshStatus, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  async function save(partial: Partial<Settings>): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const updated = (await res.json()) as Settings;
      setSettings(updated);
      refreshStatus();
    } finally {
      setSaving(false);
    }
  }

  async function fetchOllamaModels(url: string): Promise<string[]> {
    const res = await fetch(`/api/settings/ollama-models?url=${encodeURIComponent(url)}`);
    const data = (await res.json()) as { models: string[] };
    return data.models;
  }

  return { settings, status, saving, save, fetchOllamaModels };
}
