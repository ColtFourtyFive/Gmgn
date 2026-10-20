// Layout building blocks for pages. AppShell itself is mounted by App.tsx.

export { useDeposit } from './AccountControls';
export { Logo, LogoMark } from './Logo';
export { activeSection, NAV_ITEMS, switchChainPath, type NavItem } from './nav';
export { NOTIFICATION_KIND_META, notificationMeta, type NotificationKindMeta } from './notifications';
export { Page, PageHeader, usePageTitle, type PageHeaderProps, type PageProps } from './Page';
