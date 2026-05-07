import { useState } from 'react';
import type { ClarifyingQuestion as ClarifyingQuestionType } from '../types';
import { CancelConfirm } from './CancelConfirm';

interface ClarifyingQuestionProps {
  question: ClarifyingQuestionType;
  onAnswer: (answer: string) => void;
  onCancel: () => void;
  loading: boolean;
}

export function ClarifyingQuestion({ question, onAnswer, onCancel, loading }: ClarifyingQuestionProps) {
  const [selected, setSelected] = useState<string>('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const canSubmit = selected.trim().length > 0;

  const handleSubmit = () => {
    if (canSubmit && !loading) {
      onAnswer(selected.trim());
    }
  };

  const renderInput = () => {
    if (question.options === null) {
      return (
        <textarea
          className="question-freetext"
          value={selected}
          onChange={e => setSelected(e.target.value)}
          placeholder="Escribe tu respuesta..."
          rows={3}
          disabled={loading}
        />
      );
    }

    if (question.options.length > 4) {
      return (
        <select
          className="question-freetext"
          value={selected}
          onChange={e => { if (!loading) setSelected(e.target.value); }}
          disabled={loading}
        >
          <option value="">Selecciona una opción...</option>
          {question.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    return (
      <div className="question-options">
        {question.options.map(opt => (
          <button
            key={opt}
            type="button"
            className={`question-option${selected === opt ? ' selected' : ''}`}
            onClick={() => { if (!loading) setSelected(opt); }}
            disabled={loading}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="questions-view">
      <h2>Una pregunta más</h2>
      <p className="form-hint">
        Para asignar tu incidencia al equipo correcto, necesitamos este dato.
      </p>

      <div className="question-block">
        <p className="question-text">{question.question}</p>
        {renderInput()}
      </div>

      <div className="confirmation-actions">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="btn-primary"
        >
          {loading ? 'Procesando...' : 'Continuar'}
        </button>
      </div>

      {showCancelConfirm ? (
        <CancelConfirm
          onConfirm={onCancel}
          onDismiss={() => setShowCancelConfirm(false)}
        />
      ) : (
        <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            disabled={loading}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-hint)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', padding: '0.25rem' }}
          >
            Cancelar incidencia
          </button>
        </div>
      )}
    </div>
  );
}
