import { useEffect, useState } from "react";
import { Select } from "./Select";
import type { Settings } from "../types";

interface Props {
  settings: Settings | null;
  saving: boolean;
  onSave: (partial: Partial<Settings>) => Promise<void>;
  onFetchModels: (url: string) => Promise<string[]>;
  onClose: () => void;
}

export function SettingsPanel({ settings, saving, onSave, onFetchModels, onClose }: Props) {
  const [layaUrl, setLayaUrl] = useState(settings?.layaUrl ?? "");
  const [ollamaUrl, setOllamaUrl] = useState(settings?.ollamaUrl ?? "");
  const [ollamaModel, setOllamaModel] = useState(settings?.ollamaModel ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Settings only arrive asynchronously after mount (fetched from the
  // API) - sync the form once they land, without clobbering edits the
  // user has already started making on a later render.
  useEffect(() => {
    if (!settings) return;
    setLayaUrl(settings.layaUrl);
    setOllamaUrl(settings.ollamaUrl);
    setOllamaModel(settings.ollamaModel);
  }, [settings]);

  async function refreshModels() {
    setModelsLoading(true);
    try {
      setModels(await onFetchModels(ollamaUrl));
    } finally {
      setModelsLoading(false);
    }
  }

  return (
    <div className="settings-panel fade-in">
      <div className="settings-panel-header">
        <h3>Settings</h3>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <label className="settings-field">
        <span>Laya / Jev-compatible API</span>
        <input value={layaUrl} onChange={(e) => setLayaUrl(e.target.value)} placeholder="http://localhost:8000" />
      </label>

      <label className="settings-field">
        <span>Ollama-compatible text model API</span>
        <input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434" />
      </label>

      <label className="settings-field">
        <span>Model</span>
        <div className="settings-model-row">
          <Select
            ariaLabel="Ollama model"
            placeholder="-- refresh to load models --"
            value={ollamaModel}
            align="right"
            onChange={setOllamaModel}
            options={[
              ...(ollamaModel && !models.includes(ollamaModel) ? [{ value: ollamaModel, label: ollamaModel }] : []),
              ...models.map((m) => ({ value: m, label: m })),
            ]}
          />
          <button type="button" onClick={refreshModels} disabled={modelsLoading}>
            {modelsLoading ? "..." : "Refresh"}
          </button>
        </div>
      </label>

      <div className="settings-actions">
        <button
          type="button"
          className="submit-button"
          disabled={saving}
          onClick={() => onSave({ layaUrl, ollamaUrl, ollamaModel })}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
