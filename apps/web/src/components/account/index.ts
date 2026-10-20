// Account-area building blocks (portfolio, watchlist, copy trade, sniper,
// alerts, rewards, settings). Page-specific pieces live in subfolders and
// are imported by path.

export { AccountGate, useSignedIn, type AccountGateProps } from './AccountGate';
export { addressError, addressPlaceholder, isAddressFor, normalizeAddress, sameAddress } from './address';
export { ChainFilter, parseScope, type ChainFilterProps } from './ChainFilter';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
export { EquityChart, type EquityChartProps, type EquityPoint } from './EquityChart';
export { splitFieldError, type FieldError } from './errors';
export { DetailRow, FormSection, Note, PresetPicker } from './FormBits';
export { ORDER_KIND_LABEL, OrderAmount, OrderKindCell, OrderResult, OrderStatusBadge, OrderTrigger, SideBadge } from './orders';
export { TokenPreview, WalletPreview } from './previews';
export { accountKeys, useTokenMeta, useWalletProfile, type ChainScope } from './queries';
export { TagInput, type TagInputProps } from './TagInput';
