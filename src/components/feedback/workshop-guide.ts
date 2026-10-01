export type WorkshopMood = 'idle' | 'happy' | 'waiting' | 'success' | 'warning' | 'error';

export type WorkshopGuideContext = 'tracking' | 'inventory' | 'production' | 'orders' | 'dashboard' | 'settings' | 'general';

export type WorkshopGuideFacts = {
  stage?: string;
  progress?: number;
  productCount?: number;
  publicPhotoCount?: number;
  availablePieces?: number;
  pendingOffcuts?: number;
  materialsWithPieces?: number;
  materialsWithoutPieces?: number;
  productionJobs?: number;
  activeOrders?: number;
  openIncidents?: number;
  ordersWithBalance?: number;
  kerfMm?: number;
};

export type WorkshopGuidePush = {
  available: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
};

export type WorkshopGuideTip = {
  id: string;
  title: string;
  message: string;
  action?: 'activate-push';
};

export const workshopGuideName = 'Nudo';

export const workshopGuideMessages = {
  loading: 'Buscando el avance de tu pedido…',
  waiting: 'El taller ya recibió tu pedido. Aquí aparecerán los próximos avances.',
  noTimeline: 'El primer movimiento del taller aparecerá aquí.',
  noPhotos: 'Todavía no hay fotografías públicas.',
  noUpdates: 'El taller aún no publicó actualizaciones.',
  offline: 'Parece que no hay conexión. Vuelve a intentarlo en unos segundos.',
  pushDenied: 'Las notificaciones están bloqueadas en este navegador.',
  pushUnavailable: 'Avisos no disponibles temporalmente.',
  pushSuccess: 'Te avisaremos cuando haya un avance público.',
} as const;

const trackingStageTips: Record<string, WorkshopGuideTip[]> = {
  ORDER_RECEIVED: [
    { id: 'tracking-received-next', title: 'Pedido recibido', message: 'Tu pedido ya fue registrado. El siguiente paso es preparar los materiales.' },
    { id: 'tracking-received-record', title: 'Pedido recibido', message: 'El taller está organizando el trabajo. El avance aparecerá aquí conforme se registren nuevas etapas.' },
  ],
  MATERIALS_RESERVED: [
    { id: 'tracking-materials-separated', title: 'Materiales preparados', message: 'El taller está preparando la madera y los insumos para continuar con tu pedido.' },
    { id: 'tracking-materials-next', title: 'Materiales preparados', message: 'Con los materiales listos, el siguiente paso es preparar las piezas del mueble.' },
  ],
  CUTTING: [
    { id: 'tracking-cutting-dimensions', title: 'Corte', message: 'Ahora se preparan las piezas con las medidas definidas para tu proyecto.' },
    { id: 'tracking-cutting-kerf', title: 'Corte', message: 'Al distribuir las piezas también se considera el ancho que pierde la madera con cada pasada de sierra.' },
    { id: 'tracking-cutting-offcuts', title: 'Corte', message: 'Los retazos que pueden aprovecharse se identifican para conservarlos en el taller.' },
  ],
  ASSEMBLY: [
    { id: 'tracking-assembly-structure', title: 'Ensamblaje', message: 'Las piezas ya están tomando forma. En esta etapa se arma la estructura del mueble.' },
    { id: 'tracking-assembly-fit', title: 'Ensamblaje', message: 'El taller une las piezas y revisa cómo encajan antes de preparar la superficie.' },
  ],
  SANDING: [
    { id: 'tracking-sanding-surface', title: 'Lijado', message: 'Estamos preparando la superficie para que el acabado final quede parejo.' },
    { id: 'tracking-sanding-detail', title: 'Lijado', message: 'El lijado suaviza la madera antes de aplicar barniz, pintura u otro acabado.' },
  ],
  FINISHING: [
    { id: 'tracking-finishing-coat', title: 'Acabado', message: 'Se están aplicando los detalles finales, como barniz o pintura.' },
    { id: 'tracking-finishing-dry', title: 'Acabado', message: 'Después de aplicar el acabado, el taller deja que la superficie se asiente antes de la revisión final.' },
  ],
  QUALITY_CONTROL: [
    { id: 'tracking-quality-measures', title: 'Control de calidad', message: 'El taller revisa las medidas, el acabado y el funcionamiento del mueble.' },
    { id: 'tracking-quality-last', title: 'Control de calidad', message: 'Esta revisión final ayuda a confirmar que el trabajo esté listo para coordinar.' },
  ],
  READY: [
    { id: 'tracking-ready-coordinate', title: 'Listo para coordinar', message: 'Tu pedido ya está listo. El siguiente paso es coordinar la entrega con el taller.' },
    { id: 'tracking-ready-complete', title: 'Listo para coordinar', message: 'El trabajo terminó y el taller puede acordar contigo cómo realizar la entrega.' },
  ],
  DELIVERED: [
    { id: 'tracking-delivered', title: 'Pedido entregado', message: 'El taller registró la entrega de tu pedido. Gracias por confiar en su trabajo.' },
    { id: 'tracking-delivered-history', title: 'Pedido entregado', message: 'Puedes consultar aquí el recorrido público que tuvo tu pedido en el taller.' },
  ],
  CANCELLED: [
    { id: 'tracking-cancelled', title: 'Pedido cancelado', message: 'El seguimiento muestra que el pedido fue cancelado. Para más información, comunícate con el taller.' },
    { id: 'tracking-cancelled-contact', title: 'Pedido cancelado', message: 'Si tienes dudas sobre este estado, el taller puede orientarte directamente.' },
  ],
};

const countLabel = (value: number, singular: string, plural = `${singular}s`) => `${value} ${value === 1 ? singular : plural}`;
const finiteCount = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : undefined;

export function getWorkshopTips({
  context, facts = {}, push,
}: { context: WorkshopGuideContext; facts?: WorkshopGuideFacts; push?: WorkshopGuidePush }): WorkshopGuideTip[] {
  if (context === 'tracking') {
    const stage = facts.stage ?? '';
    const tips = [...(trackingStageTips[stage] ?? [
      { id: 'tracking-generic-a', title: 'Seguimiento del pedido', message: 'El taller irá publicando aquí cada nuevo avance.' },
      { id: 'tracking-generic-b', title: 'Seguimiento del pedido', message: 'El porcentaje resume el avance que el taller ha registrado para tu pedido.' },
    ])];
    const productCount = finiteCount(facts.productCount);
    if (productCount !== undefined && productCount > 1) {
      tips.push({
        id: `tracking-products-${productCount}`,
        title: 'Productos del pedido',
        message: `Tu pedido incluye ${countLabel(productCount, 'producto')}. El porcentaje resume el avance público reportado para el pedido.`,
      });
    }
    const photoCount = finiteCount(facts.publicPhotoCount);
    if (photoCount !== undefined && photoCount > 0) {
      tips.push({ id: 'tracking-photos', title: 'Imágenes del avance', message: 'Las fotografías públicas muestran imágenes que el taller decidió compartir sobre el progreso.' });
    }
    const progress = finiteCount(facts.progress);
    if (progress !== undefined) {
      tips.push({ id: `tracking-progress-${progress}`, title: 'Porcentaje de avance', message: `El ${progress}% refleja las etapas registradas públicamente por el taller hasta el momento.` });
    }
    if (push?.permission === 'denied') {
      tips.push({ id: 'tracking-push-denied', title: 'Avisos del pedido', message: workshopGuideMessages.pushDenied });
    } else if (push?.subscribed) {
      tips.push({ id: 'tracking-push-active', title: 'Avisos del pedido', message: 'Los avisos están activados para este seguimiento.' });
    } else if (push?.available) {
      tips.push({
        id: 'tracking-push-enable',
        title: 'Avisos del pedido',
        message: 'Puedes recibir un aviso cuando el taller publique un avance.',
        action: 'activate-push',
      });
    }
    return tips;
  }

  if (context === 'inventory') {
    const tips: WorkshopGuideTip[] = [
      { id: 'inventory-physical-pieces', title: 'Piezas físicas', message: 'Las piezas físicas con medidas son las que el motor de corte puede evaluar para generar planos.' },
      { id: 'inventory-stock-vs-size', title: 'Stock y dimensiones', message: 'Un stock numérico no confirma que exista un tablero físico con dimensiones registradas.' },
      { id: 'inventory-offcuts', title: 'Retazos', message: 'Los retazos conservados como disponibles pueden reutilizarse en futuros pedidos.' },
    ];
    const availablePieces = finiteCount(facts.availablePieces);
    if (availablePieces !== undefined) {
      tips.push(availablePieces > 0
        ? { id: `inventory-available-${availablePieces}`, title: 'Disponibilidad actual', message: `El inventario cargado muestra ${countLabel(availablePieces, 'pieza física', 'piezas físicas')} disponible${availablePieces === 1 ? '' : 's'}.` }
        : { id: 'inventory-no-available-pieces', title: 'Disponibilidad actual', message: 'El inventario cargado no muestra piezas físicas con estado disponible.' });
    }
    const pendingOffcuts = finiteCount(facts.pendingOffcuts);
    if (pendingOffcuts !== undefined && pendingOffcuts > 0) {
      tips.push({ id: `inventory-pending-offcuts-${pendingOffcuts}`, title: 'Retazos por revisar', message: `Hay ${countLabel(pendingOffcuts, 'retazo')} pendiente${pendingOffcuts === 1 ? '' : 's'} de definir.` });
    }
    return tips;
  }

  if (context === 'production') {
    const tips: WorkshopGuideTip[] = [
      { id: 'production-dimensions', title: 'Antes de calcular', message: 'Revisa que largo, ancho y alto coincidan con las piezas físicas disponibles.' },
      { id: 'production-simulation', title: 'Simulación de corte', message: 'Simular un corte no modifica el inventario. La reserva se registra al confirmar el plan.' },
      { id: 'production-diagnosis', title: 'Diagnóstico del plano', message: 'Si una pieza no puede ubicarse, el diagnóstico del plano explica el motivo.' },
    ];
    const materialsWithPieces = finiteCount(facts.materialsWithPieces);
    const materialsWithoutPieces = finiteCount(facts.materialsWithoutPieces);
    if (materialsWithPieces !== undefined) {
      tips.push(materialsWithPieces > 0
        ? { id: `production-available-materials-${materialsWithPieces}`, title: 'Materiales disponibles', message: `La disponibilidad cargada muestra ${countLabel(materialsWithPieces, 'material', 'materiales')} con piezas físicas utilizables.` }
        : { id: 'production-no-available-materials', title: 'Materiales disponibles', message: 'La disponibilidad cargada no muestra piezas físicas utilizables para corte.' });
    }
    if (materialsWithoutPieces !== undefined && materialsWithoutPieces > 0) {
      tips.push({ id: `production-materials-missing-${materialsWithoutPieces}`, title: 'Revisar disponibilidad', message: `La consulta actual muestra ${countLabel(materialsWithoutPieces, 'material de corte', 'materiales de corte')} sin piezas físicas disponibles.` });
    }
    const productionJobs = finiteCount(facts.productionJobs);
    if (productionJobs !== undefined) {
      tips.push({ id: `production-jobs-${productionJobs}`, title: 'Tablero de producción', message: `El tablero tiene ${countLabel(productionJobs, 'trabajo')} cargado${productionJobs === 1 ? '' : 's'} en esta consulta.` });
    }
    return tips;
  }

  if (context === 'orders') {
    const tips: WorkshopGuideTip[] = [
      { id: 'orders-qr', title: 'Seguimiento público', message: 'El QR permite al cliente consultar el avance sin crear una cuenta.' },
      { id: 'orders-backend-pricing', title: 'Importes', message: 'Los importes del pedido se calculan y validan en el backend.' },
      { id: 'orders-visibility', title: 'Notas del taller', message: 'Una nota pública aparece en el seguimiento. Una nota interna permanece para el taller.' },
    ];
    const ordersWithBalance = finiteCount(facts.ordersWithBalance);
    if (ordersWithBalance !== undefined) {
      tips.push(ordersWithBalance > 0
        ? { id: `orders-balances-${ordersWithBalance}`, title: 'Saldos pendientes', message: `Los datos cargados muestran ${countLabel(ordersWithBalance, 'pedido')} con saldo pendiente.` }
        : { id: 'orders-no-balances', title: 'Saldos pendientes', message: 'Los datos cargados no muestran pedidos con saldo pendiente.' });
    }
    return tips;
  }

  if (context === 'dashboard') {
    const tips: WorkshopGuideTip[] = [
      { id: 'dashboard-active', title: 'Pedidos activos', message: 'Pedidos activos muestra trabajos que todavía no han finalizado.' },
      { id: 'dashboard-period', title: 'Indicadores', message: 'Los gráficos usan los datos reales del periodo seleccionado.' },
    ];
    const openIncidents = finiteCount(facts.openIncidents);
    if (openIncidents !== undefined) {
      tips.push(openIncidents > 0
        ? { id: `dashboard-incidents-${openIncidents}`, title: 'Incidencias abiertas', message: `Hay ${countLabel(openIncidents, 'incidencia')} abierta${openIncidents === 1 ? '' : 's'} que requiere${openIncidents === 1 ? '' : 'n'} atención.` }
        : { id: 'dashboard-no-incidents', title: 'Incidencias abiertas', message: 'El resumen cargado no muestra incidencias abiertas.' });
    }
    const activeOrders = finiteCount(facts.activeOrders);
    if (activeOrders !== undefined && activeOrders > 0) {
      tips.push({ id: `dashboard-active-count-${activeOrders}`, title: 'Actividad actual', message: `El resumen cargado muestra ${countLabel(activeOrders, 'pedido activo', 'pedidos activos')}.` });
    }
    return tips;
  }

  if (context === 'settings') {
    const tips: WorkshopGuideTip[] = [
      { id: 'settings-kerf-meaning', title: 'Ancho de corte', message: 'El kerf representa el ancho de madera que se pierde durante el corte.' },
      { id: 'settings-kerf-impact', title: 'Simulaciones futuras', message: 'Modificar el kerf cambia los cálculos de las simulaciones futuras.' },
    ];
    const kerfMm = finiteCount(facts.kerfMm);
    if (kerfMm !== undefined) tips.push({ id: `settings-kerf-current-${kerfMm}`, title: 'Ajuste actual', message: `El ancho de corte configurado es ${kerfMm} mm.` });
    return tips;
  }

  return [
    { id: 'general-first', title: 'Guía del taller', message: 'Nudo comparte consejos breves sobre el funcionamiento de cada sección.' },
    { id: 'general-second', title: 'Ayuda contextual', message: 'Al cambiar de pantalla, los consejos se adaptan a la sección abierta.' },
  ];
}

const stageMessages: Record<string, string> = {
  ORDER_RECEIVED: 'Tu pedido fue registrado y pronto comenzará su recorrido en el taller.',
  MATERIALS_RESERVED: 'El taller está preparando los materiales para fabricar tu mueble.',
  CUTTING: 'Las piezas se preparan con las medidas definidas para tu pedido.',
  ASSEMBLY: 'Las piezas se unen para formar la estructura del mueble.',
  SANDING: 'La superficie se prepara antes de aplicar el acabado final.',
  FINISHING: 'El taller aplica los detalles finales de color y protección.',
  QUALITY_CONTROL: 'Se revisan las medidas, el acabado y el funcionamiento del mueble.',
  READY: 'Tu pedido está listo para coordinar la entrega con el taller.',
  DELIVERED: 'El taller registró la entrega de tu pedido.',
  CANCELLED: 'Para más información sobre este estado, comunícate con el taller.',
};

export function workshopStageMessage(stage: string) {
  return stageMessages[stage] ?? 'El taller irá publicando aquí cada nuevo avance.';
}
