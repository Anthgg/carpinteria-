import type { ComponentType, SVGProps } from 'react';
import {
  ArrowDownLeft, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowRightFromSquare, ArrowRotateRight, ArrowsExpand, ArrowUpRight,
  ArrowUpRightFromSquare, Bars, Bell, Box, Boxes3, ChartColumn, Check, ChevronRight, CircleCheck, CircleExclamation, CircleInfo, CircleQuestion,
  ClockArrowRotateLeft, Comment, Copy, CreditCard, Cube, Ellipsis, FileText, FloppyDisk, Funnel, Gear, House, Layers, Link, Lock, Magnifier,
  Pause, Pencil, Persons, Picture, Play, Plus, QrCode, Receipt, Scissors, ShoppingBag, Tag, TrashBin, TriangleExclamation, Xmark,
} from '@gravity-ui/icons';

/**
 * Iconografía única de la aplicación: Gravity UI Icons (MIT), la colección de los ejemplos de HeroUI v3.
 * Nombres semánticos para que las pantallas no dependan de nombres de la librería.
 */
const ICONS = {
  dashboard: House, orders: ShoppingBag, production: Scissors, inventory: Box, users: Persons, settings: Gear,
  create: Plus, edit: Pencil, duplicate: Copy, delete: TrashBin, search: Magnifier, filter: Funnel, save: FloppyDisk, cancel: Xmark, close: Xmark,
  download: ArrowDownToLine, pdf: FileText, whatsapp: Comment, qr: QrCode, photo: Picture, incident: TriangleExclamation,
  material: Cube, wood: Layers, stock: Boxes3, reserve: Lock, cut: Scissors, offcut: Tag, history: ClockArrowRotateLeft,
  back: ArrowLeft, next: ArrowRight, chevron: ChevronRight, menu: Bars, more: Ellipsis, logout: ArrowRightFromSquare, refresh: ArrowRotateRight,
  link: Link, external: ArrowUpRightFromSquare, dimensions: ArrowsExpand, payment: CreditCard, receipt: Receipt, chart: ChartColumn,
  pause: Pause, play: Play, check: Check, success: CircleCheck, warning: TriangleExclamation, error: CircleExclamation, info: CircleInfo, help: CircleQuestion,
  incoming: ArrowDownLeft, outgoing: ArrowUpRight, lock: Lock, notify: Bell,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;
/** Escala: 16 en línea, 18 controles, 20 menú, 24 estados/encabezados, 40+ estados vacíos. */
export type IconSize = 16 | 18 | 20 | 24 | 40;

export function Icon({ name, size = 16, label, className }: { name: IconName; size?: IconSize; label?: string; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph width={size} height={size} className={`icon icon--${name}${className ? ` ${className}` : ''}`}
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: false })} />;
}
