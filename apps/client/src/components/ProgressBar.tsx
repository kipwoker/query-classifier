import type { Progress } from "../useClassifyStream";

export function ProgressBar({ progress }: { progress: Progress }) {
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="progress-label">
        {progress.backend && <span className={`tag tag-${progress.backend}`}>{progress.backend}</span>}
        <span>{progress.label}...</span>
        <span className="progress-percent">{progress.percent}%</span>
      </div>
    </div>
  );
}
