import { useId } from 'react';
import { Backpack } from 'react-kawaii';
import type { WorkshopMood } from './workshop-guide';

type WorkshopGuideProps = {
  mood?: WorkshopMood;
  message?: string;
  action?: { label: string; onClick: () => void };
  size?: number;
  context?: string;
  announce?: boolean;
};

const illustrationMood: Record<WorkshopMood, 'sad' | 'shocked' | 'happy' | 'blissful'> = {
  idle: 'happy', happy: 'blissful', waiting: 'happy', warning: 'shocked', error: 'sad', success: 'blissful',
};

export function WorkshopGuide({
  mood = 'idle', message, action, size = 76, context = 'general', announce = false,
}: WorkshopGuideProps) {
  const id = useId().replaceAll(':', '');
  return <div className={`workshop-guide workshop-guide--${mood} workshop-guide--${context}`} role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined}>
    <span className="workshop-guide__art" aria-hidden="true">
      <Backpack size={size} mood={illustrationMood[mood]} color="#52765a" uniqueId={`workshop-guide-${id}`} />
    </span>
    {message ? <p className="workshop-guide__message">{message}</p> : null}
    {action ? <button type="button" className="workshop-guide__action" onClick={action.onClick}>{action.label}</button> : null}
  </div>;
}
