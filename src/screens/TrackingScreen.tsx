import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { api, dateTime } from '../api';

type PublicTrack = {
  orderNumber: string; status: string; products: Array<{ name: string; quantity: number }>;
  createdAt: string; updatedAt: string; estimatedAt?: string | null; progress: number; currentStage: string;
  timeline: Array<{ product: string; stage: string; progress: number; at: string }>;
  notes: Array<{ product: string; content: string; at: string }>;
  photos: Array<{ id: string; product: string; caption?: string | null; url: string; at: string }>;
};

const stageLabels: Record<string, string> = {
  ORDER_RECEIVED: 'Pedido recibido', MATERIALS_RESERVED: 'Materiales preparados', CUTTING: 'Corte', ASSEMBLY: 'Ensamblaje',
  SANDING: 'Lijado', FINISHING: 'Acabado', QUALITY_CONTROL: 'Control de calidad', READY: 'Listo para coordinar',
  CONFIRMED: 'Pedido confirmado', IN_PRODUCTION: 'En producción', DELIVERED: 'Entregado', CANCELLED: 'Pedido cancelado',
};
const estimatedDeliveryFormatter = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' });

const decodeApplicationKey = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

export function TrackingScreen({ token }: { token: string }) {
  const [order, setOrder] = useState<PublicTrack | null>(null);
  const [config, setConfig] = useState<{ enabled: boolean; publicKey: string | null } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const notificationsAvailable = config?.enabled === true && Boolean(config.publicKey);
  useEffect(() => {
    let current = true;
    const load = async () => {
      try {
        const [track, notificationConfig] = await Promise.all([
          api<PublicTrack>(`/public/track/${token}`, {}, false),
          api<{ enabled: boolean; publicKey: string | null }>(`/public/track/${token}/notifications`, {}, false),
        ]);
        if (current) { setOrder(track); setConfig(notificationConfig); setError(''); }
      } catch (reason) { if (current) setError(reason instanceof Error ? reason.message : 'No encontramos este seguimiento.'); }
    };
    void load();
    const interval = window.setInterval(() => void load(), 30000);
    return () => { current = false; window.clearInterval(interval); };
  }, [token]);

  const enableNotifications = async () => {
    setBusy(true); setMessage('');
    try {
      if (!config?.enabled || !config.publicKey) throw new Error('Las notificaciones web no están configuradas en este taller. Puedes volver a consultar este enlace cuando quieras.');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Este navegador no es compatible con notificaciones web.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No se concedió permiso para enviar notificaciones.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      let subscription = await registration.pushManager.getSubscription();
      // Browser push subscriptions must survive unmount so updates arrive while this page is closed.
      // The user can remove one explicitly with the "Desactivar avisos" action below.
      // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeApplicationKey(config.publicKey) });
      await api(`/public/track/${token}/notifications`, { method: 'POST', body: JSON.stringify(subscription.toJSON()) }, false);
      setSubscribed(true); setMessage('Notificaciones activadas para este pedido.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'No se pudieron activar las notificaciones.'); }
    finally { setBusy(false); }
  };

  const disableNotifications = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api(`/public/track/${token}/notifications`, { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) }, false);
        await subscription.unsubscribe();
      }
      setSubscribed(false); setMessage('Notificaciones desactivadas.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'No se pudieron desactivar.'); }
    finally { setBusy(false); }
  };

  return <main className="tracking-page"><div className="tracking-shell">
    <header className="tracking-header"><a href="/" className="app-brand app-brand--tracking"><span className="app-brand__mark">C<span>°</span></span><span className="app-brand__text"><b>CARPINTERÍA</b><small>ORDENADA 360°</small></span></a><span className="tracking-badge"><span className="status-dot status-dot--green" /> SEGUIMIENTO DE PEDIDO</span></header>
    {error ? <section className="tracking-error"><span>⌑</span><h1>Este enlace no está disponible.</h1><p>{error}</p><a href="/">Volver al inicio</a></section> : !order ? <section className="tracking-loading"><span className="spinner" /><p>Buscando tu pedido…</p></section> : <>
      <section className="tracking-hero"><div><p className="eyebrow">PEDIDO {order.orderNumber}</p><h1>Así va tu<br /><em>proyecto.</em></h1><p className="tracking-hero__lead">Seguimos cada paso del taller para que puedas ver el avance cuando quieras.</p><div className="tracking-updated">Última actualización · {dateTime(order.updatedAt)}</div></div><div className="progress-ring" role="img" aria-label={`Avance ${order.progress}%`} style={{ '--progress': `${order.progress * 3.6}deg` } as CSSProperties}><div><b>{order.progress}<small>%</small></b><span>AVANCE</span></div><i aria-hidden="true">✳</i></div><div className="tracking-wood" aria-hidden="true"><span /><span /><span /></div></section>
      <div className="tracking-content"><div className="tracking-main-column">
        <section className="tracking-card tracking-stage-card"><div className="tracking-card__heading"><div><p className="eyebrow">ESTADO ACTUAL</p><h2>{stageLabels[order.currentStage] ?? stageLabels[order.status] ?? 'En seguimiento'}</h2></div><span className="tracking-stage-icon">⌁</span></div><div className="tracking-progress-track"><span style={{ width: `${order.progress}%` }} /></div><div className="tracking-progress-labels"><span>Recibido</span><span>En taller</span><span>Terminado</span></div><div className="tracking-stage-grid">{order.products.map((product, index) => <div className="tracking-product" key={`${product.name}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{product.name}</b><small>Cantidad · {product.quantity}</small></div></div>)}</div>{order.estimatedAt ? <p className="estimated-date">Fecha estimada de entrega <b>{estimatedDeliveryFormatter.format(new Date(order.estimatedAt))}</b></p> : null}</section>
        <section className="tracking-card"><div className="tracking-card__heading"><div><p className="eyebrow">DE PRINCIPIO A FIN</p><h2>Recorrido en el taller</h2></div><span className="timeline-count">{order.timeline.length} pasos</span></div>{order.timeline.length ? <div className="public-timeline">{order.timeline.map((event, index) => <article className={`public-timeline__entry ${index === order.timeline.length - 1 ? 'is-latest' : ''}`} key={`${event.stage}-${event.at}-${index}`}><span className="public-timeline__dot">{index === order.timeline.length - 1 ? '·' : '✓'}</span><div><b>{stageLabels[event.stage] ?? event.stage}</b><p>{event.product} · {event.progress}%</p><time>{dateTime(event.at)}</time></div></article>)}</div> : <div className="tracking-empty"><span>⌑</span><p>El primer movimiento del taller aparecerá aquí.</p></div>}</section>
        {order.notes.length ? <section className="tracking-card"><div className="tracking-card__heading"><div><p className="eyebrow">MENSAJES DEL TALLER</p><h2>Actualizaciones</h2></div></div><div className="public-notes">{order.notes.map((note, index) => <article key={`${note.at}-${index}`}><span>NOTA PÚBLICA · {note.product}</span><p>{note.content}</p><time>{dateTime(note.at)}</time></article>)}</div></section> : null}
      </div><aside className="tracking-side-column"><section className="tracking-card notifications-card"><span className="notification-icon">♧</span><p className="eyebrow">A TU RITMO</p><h2>Te avisamos<br />cuando avance.</h2><p>{notificationsAvailable ? 'Recibe un aviso si cambia una etapa o el pedido queda listo.' : 'El taller todavía no configuró las notificaciones para este seguimiento.'}</p>{subscribed ? <button type="button" className="button button--light" onClick={() => void disableNotifications()} disabled={busy}>Desactivar avisos</button> : <button type="button" className="button button--primary" onClick={() => void enableNotifications()} disabled={busy || !notificationsAvailable}>{busy ? 'Activando…' : config ? notificationsAvailable ? 'Activar notificaciones' : 'Avisos no disponibles' : 'Consultando avisos…'} {notificationsAvailable ? <span>↗</span> : null}</button>}{message ? <small className="notification-message" role="status">{message}</small> : null}</section><section className="tracking-card photo-card"><div className="tracking-card__heading"><div><p className="eyebrow">DESDE EL TALLER</p><h2>Imágenes del avance</h2></div><span className="camera-icon">▧</span></div>{order.photos.length ? <div className="public-photo-grid">{order.photos.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.caption || `Avance de ${photo.product}`} loading="lazy" /><figcaption>{photo.caption || photo.product}<small>{dateTime(photo.at)}</small></figcaption></figure>)}</div> : <div className="tracking-empty"><span>▧</span><p>Las fotografías públicas se compartirán aquí.</p></div>}</section><section className="tracking-side-note"><span>✳</span><p>Cada mueble se fabrica con atención al detalle, desde la selección de madera hasta el acabado final.</p></section></aside></div>
    </>}
    <footer className="tracking-footer"><span>Carpintería Ordenada 360°</span><span>Seguimiento de pedidos <b>·</b> {order?.orderNumber ?? ''}</span></footer>
  </div></main>;
}
