import { useState } from 'react';
import type { DynamicQuestion } from '../types';

interface DynamicQuestionsProps {
  questions: DynamicQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
  disabled?: boolean;
}

export function DynamicQuestions({ questions, onSubmit, onSkip, disabled = false }: DynamicQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleSelect = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleText = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const allAnswered = questions.every(q => {
    const val = answers[q.id];
    if (!val) return false;
    return val.trim().length > 0;
  });

  const handleSubmit = () => {
    if (allAnswered) onSubmit(answers);
  };

  return (
    <div className="questions-view">
      <h2>Una cosa más</h2>
      <p className="form-hint">
        Para ayudar mejor al técnico, necesitamos un poco más de contexto.
      </p>

      {questions.map(q => (
        <div key={q.id} className="question-block">
          <p className="question-text">{q.text}</p>

          {q.type === 'options' && q.options ? (
            <div className="question-options">
              {q.options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`question-option${answers[q.id] === opt.value ? ' selected' : ''}`}
                  onClick={() => handleSelect(q.id, opt.value)}
                  disabled={disabled}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              className="question-freetext"
              value={answers[q.id] ?? ''}
              onChange={e => handleText(q.id, e.target.value)}
              placeholder={q.placeholder ?? ''}
              rows={3}
              disabled={disabled}
            />
          )}
        </div>
      ))}

      <div className="confirmation-actions">
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || disabled}
          className="btn-primary"
        >
          Continuar
        </button>
        <button onClick={onSkip} disabled={disabled} className="btn-secondary">
          Omitir
        </button>
      </div>
    </div>
  );
}
