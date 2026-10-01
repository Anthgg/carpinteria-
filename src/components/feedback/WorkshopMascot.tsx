import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { WorkshopGuide } from './WorkshopGuide';
import {
  getWorkshopTips, workshopGuideName,
  type WorkshopGuideContext, type WorkshopGuideFacts, type WorkshopGuidePush, type WorkshopGuideTip,
} from './workshop-guide';

type WorkshopMascotProps = {
  context: WorkshopGuideContext;
  facts?: WorkshopGuideFacts;
  push?: WorkshopGuidePush;
  onActivatePush?: () => void;
};

function chooseTip(tips: WorkshopGuideTip[], previousId?: string) {
  if (!tips.length) return null;
  const eligible = tips.length > 1 ? tips.filter((tip) => tip.id !== previousId) : tips;
  return eligible[Math.floor(Math.random() * eligible.length)] ?? tips[0];
}

export function WorkshopMascot({ context, facts, push, onActivatePush }: WorkshopMascotProps) {
  const tips = useMemo(() => getWorkshopTips({ context, facts, push }), [context, facts, push]);
  const [tip, setTip] = useState<WorkshopGuideTip | null>(() => chooseTip(tips));
  const previousTip = useRef<string | undefined>(tip?.id);

  useEffect(() => {
    const next = chooseTip(tips, previousTip.current);
    if (!next) return;
    previousTip.current = next.id;
    setTip(next);
  }, [tips]);

  const anotherTip = () => {
    const next = chooseTip(tips, previousTip.current);
    if (!next) return;
    previousTip.current = next.id;
    setTip(next);
  };

  if (!tip) return null;

  return <Popover.Root>
    <Button
      type="button"
      variant="ghost"
      className="workshop-mascot__trigger"
      aria-label="Abrir consejos del taller"
    >
      <WorkshopGuide size={52} context="floating" />
      <span className="workshop-mascot__indicator" aria-hidden="true" />
    </Button>
    <Popover.Content placement="top end" offset={12} className="workshop-mascot__popover">
      <Popover.Dialog aria-label="Consejos del taller">
        <div className="workshop-mascot__heading">
          <WorkshopGuide size={42} context="floating" />
          <div><span>TE ACOMPAÑA</span><Popover.Heading>{workshopGuideName} te cuenta</Popover.Heading></div>
        </div>
        <h3>{tip.title}</h3>
        <p className="workshop-mascot__message">{tip.message}</p>
        {tip.action === 'activate-push' && onActivatePush ? <button type="button" className="workshop-mascot__action" onClick={onActivatePush}>Activar avisos <span aria-hidden="true">→</span></button> : null}
        <button type="button" className="workshop-mascot__another" onClick={anotherTip}>Otro consejo</button>
      </Popover.Dialog>
    </Popover.Content>
  </Popover.Root>;
}
