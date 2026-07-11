"use client";

import {
  buildExpectedAnswerHint,
  shouldShowComicAnswerHints,
  type ComicExpectedAnswerSpec,
} from "@/lib/comic-answer-hints";

export type ComicAnswerHintProps = {
  spec: ComicExpectedAnswerSpec;
  wrongAttempts: number;
  revealAnswer: boolean;
  onRevealAnswer: () => void;
  typingChecked: boolean;
  typingStatus?: "correct" | "partial" | "incorrect";
};

export function ComicAnswerHint({
  spec,
  wrongAttempts,
  revealAnswer,
  onRevealAnswer,
  typingChecked,
  typingStatus,
}: ComicAnswerHintProps) {
  if (
    !shouldShowComicAnswerHints({
      typingChecked,
      typingStatus,
      wrongAttempts,
      revealAnswer,
    })
  ) {
    return null;
  }

  const built = buildExpectedAnswerHint({ spec, wrongAttempts, revealAnswer });
  const showRevealButton =
    wrongAttempts > 0 && typingStatus !== "correct" && !revealAnswer && !built.showExpectedAnswer;

  return (
    <div className="lr-comic-answer-hint" data-hint-level={built.level}>
      {built.hintText ? (
        <p className="lr-comic-answer-hint__text">
          <span className="lr-comic-answer-hint__label">Hint:</span> {built.hintText}
        </p>
      ) : null}
      {showRevealButton ? (
        <button
          type="button"
          className="lr-comic-show-answer-button"
          onClick={(event) => {
            event.stopPropagation();
            onRevealAnswer();
          }}
        >
          Show expected answer
        </button>
      ) : null}
      {built.showExpectedAnswer && built.expectedAnswers.length > 0 ? (
        <div className="lr-comic-expected-answer">
          <span className="lr-comic-answer-hint__label">
            {spec.expectedAnswerLabel ?? "Expected answer:"}
          </span>
          {built.expectedAnswers.length === 1 ? (
            <span className="lr-comic-expected-answer__value">{built.expectedAnswers[0]}</span>
          ) : (
            <ul className="lr-comic-expected-answer__list">
              {built.expectedAnswers.map((answer) => (
                <li key={answer}>{answer}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
