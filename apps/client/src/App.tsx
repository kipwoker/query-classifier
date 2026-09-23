import { useEffect, useState } from "react";
import { QueryForm } from "./components/QueryForm";
import { ResultPanel } from "./components/ResultPanel";
import { TraceWaterfall } from "./components/TraceWaterfall";
import { ProgressBar } from "./components/ProgressBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { useClassifyStream } from "./useClassifyStream";
import { useSettings } from "./useSettings";
import type { DomainInfo, Example } from "./types";

export function App() {
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [domain, setDomain] = useState<string>("");
  const [examples, setExamples] = useState<Example[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { start, progress, response, error, loading } = useClassifyStream();
  const { settings, status, saving, save, fetchOllamaModels } = useSettings();

  useEffect(() => {
    fetch("/api/domains")
      .then((r) => r.json() as Promise<DomainInfo[]>)
      .then((d) => {
        setDomains(d);
        if (d[0]) setDomain(d[0].name);
      })
      .catch(() => setLoadError("Could not load domains from the API"));
  }, []);

  useEffect(() => {
    if (!domain) return;
    fetch(`/api/examples?domain=${encodeURIComponent(domain)}`)
      .then((r) => r.json() as Promise<Example[]>)
      .then(setExamples)
      .catch(() => setLoadError("Could not load examples from the API"));
  }, [domain]);

  return (
    <div className="app">
      <div className="settings-trigger">
        <span
          className={`status-dot ${status?.ready ? "status-ready" : "status-not-ready"}`}
          title={status === null ? "Checking..." : status.ready ? "Laya and Ollama are reachable" : "Needs setup - laya and/or ollama not reachable"}
        />
        <button type="button" className="icon-button gear-button" onClick={() => setSettingsOpen((o) => !o)} aria-label="Settings">
          ⚙
        </button>
        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            saving={saving}
            onSave={save}
            onFetchModels={fetchOllamaModels}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      <header className="app-header">
        <h1>
          <span className="app-title-glow">query-classifier</span>
        </h1>
        <p className="app-subtitle">Ask in natural language to get structured query.</p>
      </header>

      <div className="panel domain-panel">
        <span className="panel-label">Domain</span>
        <div className="domain-pills">
          {domains.map((d) => (
            <button
              type="button"
              key={d.name}
              className={`domain-pill${d.name === domain ? " active" : ""}`}
              onClick={() => setDomain(d.name)}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <QueryForm examples={examples} onSubmit={(query) => start(query, domain)} loading={loading} />
        {loading && progress && <ProgressBar progress={progress} />}
      </div>

      {(loadError || error) && <p className="error-banner">{loadError ?? error}</p>}

      {response && (
        <div className="results fade-in">
          <div className="panel">
            <ResultPanel result={response.result} />
          </div>
          <div className="panel">
            <TraceWaterfall trace={response.trace} />
          </div>
        </div>
      )}
    </div>
  );
}
