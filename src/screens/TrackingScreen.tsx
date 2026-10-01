import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { api, ApiError, dateTime } from '../api';
import { Icon } from '../components/Icon';
import { WorkshopGuide } from '../components/feedback/WorkshopGuide';
import { WorkshopMascot } from '../components/feedback/WorkshopMascot';
import { workshopGuideMessages, type WorkshopGuideFacts } from '../components/feedback/workshop-guide';

type PublicTrack = {
  orderNumber: string;
  status: string;
  products: Array<{ name: string; quantity: number; type?: string }>;
  createdAt: string;
  updatedAt: string;
  estimatedAt?: string | null;
  progress: number;
  currentStage: string;
  timeline: Array<{ product: string; stage: string; progress: number; at: string }>;
  notes: Array<{ product: string; content: string; at: string }>;
  photos: Array<{ id: string; product: string; caption?: string | null; url: string; at: string }>;
};

type NotificationConfig = { enabled: boolean; publicKey: string | null; subscribed: boolean };
type TrackingError = { kind: 'not-found' | 'network'; message: string };

const stageLabels: Record<string, string> = {
  ORDER_RECEIVED: 'Pedido recibido', MATERIALS_RESERVED: 'Materiales preparados', CUTTING: 'Corte', ASSEMBLY: 'Ensamblaje',
  SANDING: 'Lijado', FINISHING: 'Acabado', QUALITY_CONTROL: 'Control de calidad', READY: 'Listo para coordinar',
  CONFIRMED: 'Pedido confirmado', IN_PRODUCTION: 'En producción', DELIVERED: 'Entregado', CANCELLED: 'Pedido cancelado',
};
const estimatedDeliveryFormatter = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' });

const decodeApplicationKey = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

async function waitForActiveServiceWorker(registration: ServiceWorkerRegistration) {
  let timeoutId: number | undefined;
  try {
    const activeRegistration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('El servicio de avisos todavía se está preparando. Espera unos segundos e inténtalo otra vez.')), 12000);
      }),
    ]);
    if (activeRegistration.scope !== registration.scope || !activeRegistration.active) {
      throw new Error('El servicio de avisos no llegó a activarse. Espera unos segundos e inténtalo otra vez.');
    }
    const worker = activeRegistration.active;
    if (worker.state !== 'activated') {
      await new Promise<void>((resolve, reject) => {
        const activationTimeout = window.setTimeout(() => finish(() => reject(new Error('El servicio de avisos todavía se está activando. Espera unos segundos e inténtalo otra vez.'))), 12000);
        const finish = (complete: () => void) => {
          window.clearTimeout(activationTimeout);
          worker.removeEventListener('statechange', checkState);
          complete();
        };
        const checkState = () => {
          if (worker.state === 'activated') finish(resolve);
          else if (worker.state === 'redundant') finish(() => reject(new Error('El servicio de avisos no pudo activarse. Vuelve a intentarlo.')));
        };
        worker.addEventListener('statechange', checkState);
        checkState();
      });
    }
    if (worker.state !== 'activated') throw new Error('El servicio de avisos no llegó a activarse. Espera unos segundos e inténtalo otra vez.');
    return activeRegistration;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function failureFor(reason: unknown): TrackingError {
  if (reason instanceof ApiError && reason.status === 404) {
    return { kind: 'not-found', message: 'No encontramos este seguimiento. Revisa que el enlace o el código QR estén completos.' };
  }
  return { kind: 'network', message: 'No pudimos cargar el avance.' };
}

export function TrackingScreen({ token }: { token: string }) {
  const [order, setOrder] = useState<PublicTrack | null>(null);
  const [config, setConfig] = useState<NotificationConfig>({ enabled: false, publicKey: null, subscribed: false });
  const [error, setError] = useState<TrackingError | null>(null);
  const [networkIssue, setNetworkIssue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pushMessage, setPushMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [retryCount, setRetryCount] = useState(0);
  const hasLoaded = useRef(false);
  const notificationsAvailable = config.enabled && Boolean(config.publicKey)
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const guideFacts = useMemo<WorkshopGuideFacts>(() => order ? ({
    stage: order.currentStage,
    progress: order.progress,
    productCount: order.products.length,
    publicPhotoCount: order.photos.length,
  }) : ({}), [order?.currentStage, order?.progress, order?.products.length, order?.photos.length]);
  const guidePush = useMemo(() => ({ available: notificationsAvailable, permission, subscribed }), [notificationsAvailable, permission, subscribed]);

  useEffect(() => {
    let current = true;
    const load = async () => {
      try {
        const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
        const existingSubscription = await registration?.pushManager.getSubscription();
        const headers = existingSubscription ? { 'x-push-endpoint': existingSubscription.endpoint } : undefined;
        const track = await api<PublicTrack>(`/public/track/${token}`, {}, false);
        let notificationConfig: NotificationConfig = { enabled: false, publicKey: null, subscribed: false };
        try {
          notificationConfig = await api<NotificationConfig>(`/public/track/${token}/notifications`, { headers }, false);
        } catch { /* Push is optional; tracking remains available if its config endpoint fails. */ }
        if (current) {
          setOrder(track);
          setConfig(notificationConfig);
          setSubscribed(notificationConfig.subscribed);
          setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
          setError(null);
          setNetworkIssue(false);
          hasLoaded.current = true;
        }
      } catch (reason) {
        if (current && !hasLoaded.current) setError(failureFor(reason));
        else if (current) setNetworkIssue(true);
      } finally {
        if (current) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 30000);
    return () => { current = false; window.clearInterval(interval); };
  }, [retryCount, token]);

  const retry = () => {
    setError(null);
    setNetworkIssue(false);
    setLoading(!hasLoaded.current);
    setRetryCount((count) => count + 1);
  };

  const enableNotifications = async () => {
    setBusy(true);
    setPushMessage('');
    try {
      if (!config.enabled || !config.publicKey) throw new Error(workshopGuideMessages.pushUnavailable);
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Este navegador no admite notificaciones web.');
      }
      if (Notification.permission === 'denied') throw new Error(workshopGuideMessages.pushDenied);
      if (Notification.permission === 'default' && await Notification.requestPermission() !== 'granted') {
        setPermission(Notification.permission);
        throw new Error('No se concedió permiso para enviar notificaciones.');
      }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const activeRegistration = await waitForActiveServiceWorker(registration);
      let subscription = await activeRegistration.pushManager.getSubscription();
      // La suscripción del navegador se conserva; el backend la activa por separado para cada pedido.
      // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
      if (!subscription) subscription = await activeRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationKey(config.publicKey),
      });
      await api(`/public/track/${token}/notifications`, {
        method: 'POST', body: JSON.stringify(subscription.toJSON()),
      }, false);
      setSubscribed(true);
      setPermission(Notification.permission);
      setPushMessage('Avisos activados para este pedido.');
    } catch (reason) {
      setPushMessage(reason instanceof Error ? reason.message : 'No se pudieron activar las notificaciones.');
      if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async () => {
    setBusy(true);
    setPushMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api(`/public/track/${token}/notifications`, {
          method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }),
        }, false);
      }
      setSubscribed(false);
      setPushMessage('Avisos desactivados para este pedido.');
    } catch (reason) {
      setPushMessage(reason instanceof Error ? reason.message : 'No se pudieron desactivar los avisos.');
    } finally {
      setBusy(false);
    }
  };

  const pushDenied = permission === 'denied';

  return <main className="tracking-page">
    <div className="tracking-shell">
      <header className="tracking-header">
        <a href="/" className="app-brand app-brand--tracking" aria-label="Carpintería Ordenada 360°">
          <img className="brand-logo" src="/brand/carpinteria-360-logo-192.png" width={192} height={192} alt="" />
          <span className="app-brand__text"><b>CARPINTERÍA</b><small>ORDENADA 360°</small></span>
        </a>
        <span className="tracking-badge"><span className="status-dot status-dot--green" /> SEGUIMIENTO DE PEDIDO</span>
      </header>

      {error ? <section className={`tracking-state tracking-state--${error.kind}`} role="alert">
        <WorkshopGuide mood={error.kind === 'not-found' ? 'warning' : 'error'} message={error.kind === 'not-found' ? 'Comprueba el enlace que recibiste del taller.' : workshopGuideMessages.offline} context="tracking-state" />
        <h1>{error.kind === 'not-found' ? 'No encontramos este seguimiento.' : 'No pudimos cargar el avance.'}</h1>
        {error.kind === 'network' ? <button type="button" className="button button--primary" onClick={retry}>Reintentar</button> : null}
      </section> : loading && !order ? <section className="tracking-loading" role="status" aria-label={workshopGuideMessages.loading}>
        <WorkshopGuide mood="waiting" message={workshopGuideMessages.loading} context="tracking-loading" announce />
        <div className="tracking-loading__skeleton" aria-hidden="true"><span /><span /><span /><span /></div>
      </section> : order ? <>
        {networkIssue ? <div className="tracking-offline" role="status"><span>{workshopGuideMessages.offline}</span><button type="button" onClick={retry}>Reintentar</button></div> : null}

        <section className="tracking-hero" aria-labelledby="tracking-title">
          <div className="tracking-hero__copy">
            <p className="eyebrow">PEDIDO {order.orderNumber}</p>
            <h1 id="tracking-title">Así va tu<br /><em>proyecto.</em></h1>
            <p className="tracking-hero__lead">Seguimos cada paso del taller para que puedas ver el avance cuando quieras.</p>
            <div className="tracking-updated">Última actualización · {dateTime(order.updatedAt)}</div>
          </div>
          <div className="progress-ring" role="img" aria-label={`Avance ${order.progress}%`} style={{ '--progress': `${order.progress * 3.6}deg` } as CSSProperties}>
            <div><b>{order.progress}<small>%</small></b><span>AVANCE</span></div>
          </div>
          <div className="tracking-wood" aria-hidden="true"><span /><span /><span /></div>
        </section>

        <div className="tracking-content">
          <section className="tracking-section tracking-stage-card" aria-labelledby="tracking-stage-title">
            <div className="tracking-card__heading"><div><p className="eyebrow">ESTADO ACTUAL</p><h2 id="tracking-stage-title">{stageLabels[order.currentStage] ?? stageLabels[order.status] ?? 'En seguimiento'}</h2></div><span className="tracking-stage-icon"><Icon name="production" size={24} /></span></div>
            <div className="tracking-progress-track" role="progressbar" aria-label="Avance del pedido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={order.progress}><span style={{ width: `${order.progress}%` }} /></div>
            <div className="tracking-progress-labels"><span>Recibido</span><span>En taller</span><span>Terminado</span></div>
            <div className="tracking-stage-grid">{order.products.map((product, index) => <div className="tracking-product" key={`${product.name}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{product.name}</b><small>Cantidad · {product.quantity}</small></div></div>)}</div>
            {order.estimatedAt ? <p className="estimated-date">Fecha estimada de entrega <b>{estimatedDeliveryFormatter.format(new Date(order.estimatedAt))}</b></p> : null}
          </section>

          <section className={`tracking-notifications ${!notificationsAvailable ? 'tracking-notifications--unavailable' : ''}`} aria-label="Avisos del pedido">
            {!notificationsAvailable ? <p><span className="status-dot" />{permission === 'unsupported' ? 'Este navegador no admite avisos web.' : workshopGuideMessages.pushUnavailable}</p> : <>
              <div className="tracking-notifications__heading"><span className="notification-icon"><Icon name="notify" size={20} /></span><div><p className="eyebrow">A TU RITMO</p><h2>{subscribed ? 'Avisos activados' : 'Recibe avisos de este pedido'}</h2></div></div>
              <p className="tracking-notifications__copy">{pushDenied ? workshopGuideMessages.pushDenied : subscribed ? workshopGuideMessages.pushSuccess : 'Te avisaremos cuando haya un avance público.'}</p>
              {busy ? <WorkshopGuide mood="waiting" message="Activando avisos…" size={42} context="push" announce /> : null}
              {pushDenied ? (subscribed ? <button type="button" className="button button--quiet" onClick={() => void disableNotifications()} disabled={busy}>Desactivar avisos</button> : null)
                : subscribed ? <button type="button" className="button button--quiet" onClick={() => void disableNotifications()} disabled={busy}>Desactivar avisos</button>
                  : <button type="button" className="button button--primary" onClick={() => void enableNotifications()} disabled={busy}>{permission === 'granted' ? 'Activar avisos' : 'Activar avisos'}<Icon name="next" size={16} /></button>}
              {pushMessage ? <p className={`tracking-push-message ${subscribed ? 'is-success' : ''}`} role="status">{pushMessage}</p> : null}
            </>}
          </section>

          <section className="tracking-section tracking-timeline-card" aria-labelledby="tracking-timeline-title">
            <div className="tracking-card__heading"><div><p className="eyebrow">DE PRINCIPIO A FIN</p><h2 id="tracking-timeline-title">Recorrido en el taller</h2></div><span className="timeline-count">{order.timeline.length} pasos</span></div>
            {order.timeline.length ? <div className="public-timeline">{order.timeline.map((event, index) => <article className={`public-timeline__entry ${index === order.timeline.length - 1 ? 'is-latest' : ''}`} key={`${event.stage}-${event.at}-${index}`}><span className="public-timeline__dot">{index === order.timeline.length - 1 ? '·' : <Icon name="check" size={16} />}</span><div><b>{stageLabels[event.stage] ?? event.stage}</b><p>{event.product} · {event.progress}%</p><time>{dateTime(event.at)}</time></div></article>)}</div> : <div className="tracking-empty"><WorkshopGuide mood="waiting" message={workshopGuideMessages.noTimeline} size={60} context="empty" /></div>}
          </section>

          <section className="tracking-section tracking-photo-card" aria-labelledby="tracking-photo-title">
            <div className="tracking-card__heading"><div><p className="eyebrow">DESDE EL TALLER</p><h2 id="tracking-photo-title">Imágenes del avance</h2></div><span className="camera-icon"><Icon name="photo" size={24} /></span></div>
            {order.photos.length ? <div className="public-photo-grid">{order.photos.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.caption || `Avance de ${photo.product}`} loading="lazy" /><figcaption>{photo.caption || photo.product}<small>{dateTime(photo.at)}</small></figcaption></figure>)}</div> : <div className="tracking-empty"><WorkshopGuide mood="waiting" message={workshopGuideMessages.noPhotos} size={66} context="empty" /></div>}
          </section>

          <section className="tracking-section tracking-updates-card" aria-labelledby="tracking-updates-title">
            <div className="tracking-card__heading"><div><p className="eyebrow">MENSAJES DEL TALLER</p><h2 id="tracking-updates-title">Actualizaciones</h2></div></div>
            {order.notes.length ? <div className="public-notes">{order.notes.map((note, index) => <article key={`${note.at}-${index}`}><span>NOTA PÚBLICA · {note.product}</span><p>{note.content}</p><time>{dateTime(note.at)}</time></article>)}</div> : <p className="tracking-empty-copy">{workshopGuideMessages.noUpdates}</p>}
          </section>

        </div>
      </> : null}

      <footer className="tracking-footer"><span>Carpintería Ordenada 360°</span><span>Seguimiento de pedidos <b>·</b> {order?.orderNumber ?? ''}</span></footer>
    </div>
    {order ? <WorkshopMascot context="tracking" facts={guideFacts} push={guidePush} onActivatePush={() => void enableNotifications()} /> : null}
  </main>;
}
