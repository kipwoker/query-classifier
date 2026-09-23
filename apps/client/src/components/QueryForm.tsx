import { useState } from "react";
import { Select } from "./Select";
import type { Example } from "../types";

interface Props {
  examples: Example[];
  onSubmit: (query: string) => void;
  loading: boolean;
}

export function QueryForm({ examples, onSubmit, loading }: Props) {
  const [query, setQuery] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (query.trim()) onSubmit(query.trim());
      }}
    >
      <textarea
        rows={2}
        placeholder="Type a search request, or pick an example below"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="submit-row">
        <Select
          ariaLabel="Pick an example query"
          placeholder="-- pick an example --"
          value=""
          onChange={setQuery}
          options={examples.map((ex) => ({
            value: ex.query,
            label: ex.query,
            title: ex.schema ? JSON.stringify(ex.schema) : undefined,
          }))}
        />
        <button type="submit" className="submit-button" disabled={loading || !query.trim()}>
          {loading ? "Classifying..." : "Classify"}
        </button>
      </div>
    </form>
  );
}
