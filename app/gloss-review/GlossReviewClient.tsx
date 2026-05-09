"use client";

import { useMemo, useState } from "react";
import { approveGlossDraft } from "./actions";
import type { GlossLessonDraft } from "./types";

type Props = {
  drafts: GlossLessonDraft[];
  approvedIds: string[];
};

function DraftEditor({
  initial,
  onApprove,
  onReject,
  initiallyApproved,
}: {
  initial: GlossLessonDraft;
  onApprove: (draft: GlossLessonDraft) => Promise<void>;
  onReject: () => void;
  initiallyApproved: boolean;
}) {
  const [draft, setDraft] = useState<GlossLessonDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>(initiallyApproved ? "Already approved." : "");

  const handleApprove = async () => {
    setBusy(true);
    setMessage("");
    try {
      await onApprove(draft);
      setMessage("Approved.");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Approval failed.";
      setMessage(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2 style={{ marginBottom: "0.35rem" }}>{draft.title}</h2>
      <p className="muted" style={{ marginBottom: "0.35rem" }}>
        Topic: <strong>{draft.topicSuggestion}</strong> · Source score: <strong>{draft.sourceScore}</strong>
      </p>
      <p className="muted" style={{ marginBottom: "0.35rem" }}>
        Context: {draft.context}
      </p>
      <p className="muted" style={{ marginBottom: "0.7rem" }}>
        Scenario: {draft.scenario}
      </p>

      <label className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>
        Title
      </label>
      <input
        className="text-input"
        value={draft.title}
        onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
        style={{ marginBottom: "0.6rem" }}
      />

      <label className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>
        Sentences (one per line)
      </label>
      <textarea
        className="text-input"
        value={draft.sentences.join("\n")}
        onChange={(e) =>
          setDraft((prev) => ({
            ...prev,
            sentences: e.target.value
              .split(/\r?\n/u)
              .map((line) => line.trim())
              .filter(Boolean),
          }))
        }
        rows={6}
        style={{ width: "100%", marginBottom: "0.6rem" }}
      />

      <label className="muted" style={{ display: "block", marginBottom: "0.25rem" }}>
        Chunks (one per line)
      </label>
      <textarea
        className="text-input"
        value={draft.chunks.join("\n")}
        onChange={(e) =>
          setDraft((prev) => ({
            ...prev,
            chunks: e.target.value
              .split(/\r?\n/u)
              .map((line) => line.trim())
              .filter(Boolean),
          }))
        }
        rows={5}
        style={{ width: "100%", marginBottom: "0.7rem" }}
      />

      {draft.warnings.length > 0 ? (
        <div style={{ marginBottom: "0.7rem" }}>
          <p className="muted" style={{ marginBottom: "0.25rem" }}>
            Warnings:
          </p>
          <ul className="sentence-list">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" className="button" onClick={handleApprove} disabled={busy || initiallyApproved}>
          Approve
        </button>
        <button type="button" className="button" onClick={onReject} disabled={busy}>
          Reject
        </button>
      </div>
      {message ? (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function GlossReviewClient({ drafts, approvedIds }: Props) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [runtimeApproved, setRuntimeApproved] = useState<Set<string>>(new Set());

  const visibleDrafts = useMemo(
    () => drafts.filter((draft) => !hiddenIds.has(draft.id)),
    [drafts, hiddenIds]
  );

  async function handleApprove(draft: GlossLessonDraft): Promise<void> {
    const res = await approveGlossDraft(draft);
    if (!res.ok) {
      throw new Error(res.message);
    }
    setRuntimeApproved((prev) => new Set(prev).add(draft.id));
  }

  function handleReject(id: string): void {
    setHiddenIds((prev) => new Set(prev).add(id));
  }

  if (visibleDrafts.length === 0) {
    return <p className="muted">No drafts to review.</p>;
  }

  return (
    <div className="page">
      {visibleDrafts.map((draft) => (
        <DraftEditor
          key={draft.id}
          initial={draft}
          onApprove={handleApprove}
          onReject={() => handleReject(draft.id)}
          initiallyApproved={approvedIds.includes(draft.id) || runtimeApproved.has(draft.id)}
        />
      ))}
    </div>
  );
}
