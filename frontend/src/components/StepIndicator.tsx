import type { FlowStep } from '../types';

const STEPS: FlowStep[] = ['form', 'loading', 'confirmation', 'creating', 'done'];

function getStepIndex(step: FlowStep): number {
  if (step === 'error') return -1;
  if (step === 'questions') return 1;
  return STEPS.indexOf(step);
}

export function StepIndicator({ step }: { step: FlowStep }) {
  const current = getStepIndex(step);
  if (current === -1) return null;

  return (
    <div className="step-indicator">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className={`step-dot${i === current ? ' active' : ''}${i < current ? ' done' : ''}`}
        />
      ))}
    </div>
  );
}
