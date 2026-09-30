import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { navigateTo } from '../navigation';

export type ModuleTab = { label: string; href: string };

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'aria-current'> & {
  href: string; children: ReactNode; current?: boolean; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function AppLink({ href, children, current = false, onClick, ...props }: AppLinkProps) {
  const activate = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(href);
  };
  return <a {...props} href={href} aria-current={current ? 'page' : undefined} onClick={activate}>{children}</a>;
}

export function ModuleTabs({ label, tabs, activeHref }: { label: string; tabs: ModuleTab[]; activeHref: string }) {
  return <nav className="module-tabs" aria-label={`Secciones de ${label}`}>
    <div className="module-tabs__list">
      {tabs.map((tab) => <AppLink key={tab.href} href={tab.href} className="module-tabs__link" current={tab.href === activeHref}>{tab.label}</AppLink>)}
    </div>
  </nav>;
}
