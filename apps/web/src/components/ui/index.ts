// Trenchscope UI kit: generic, data-agnostic primitives.
// Import from '@/components/ui' (never deep paths) so internals can move.

export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { CopyButton, type CopyButtonProps } from './CopyButton';
export { DataTable, nextSort, sortRows, type Column, type DataTableProps, type SortDir, type SortState } from './DataTable';
export { Drawer, type DrawerProps } from './Drawer';
export { Floating, computePosition, type FloatingProps, type FloatingSide, type Placement } from './Floating';
export { IconButton, type IconButtonProps } from './IconButton';
export { Field, fieldNoteId, focusFirstError, Input, NumberInput, RangeInput, useFieldDescription, useFieldLabelId, type FieldProps, type InputProps, type NumberInputProps, type RangeInputProps } from './Input';
export { Kbd } from './Kbd';
export { Modal, type ModalProps } from './Modal';
export { Panel, PanelHeader, type PanelProps } from './Panel';
export { Heading, HeadingScope, useHeadingLevel, type HeadingLevel } from './Heading';
export { HoverCard, Menu, Popover, type HoverCardProps, type MenuItem, type PopoverProps } from './Popover';
export { Select, type SelectOption, type SelectProps } from './Select';
export { Skeleton, SkeletonText, type SkeletonProps } from './Skeleton';
export { Spinner, type SpinnerProps } from './Spinner';
export { EmptyState, ErrorState, type EmptyStateProps, type ErrorStateProps } from './States';
export { SegmentedControl, Tabs, useRovingKeys, type TabItem } from './Tabs';
export { Toaster } from './Toaster';
export { Toggle, type ToggleProps } from './Toggle';
export { Tooltip, type TooltipProps } from './Tooltip';
