import { markRaw, type Component } from 'vue';
import { MessageCircle, Settings2, ClipboardList } from '@lucide/vue';

export interface menu {
  header?: string;
  value?: string;
  title?: string;
  icon?: string | Component;
  to?: string;
  divider?: boolean;
  chip?: string;
  chipColor?: string;
  chipVariant?: string;
  chipIcon?: string;
  children?: menu[];
  disabled?: boolean;
  type?: string;
  subCaption?: string;
  isRawTitle?: boolean;
  collapsible?: boolean;
  pluginInfo?: {
    id: string;
    displayName?: string;
    author?: string | null;
    version?: string;
  };
  groupToggle?: boolean;
}

// Kept for compatibility with plugin navigation helpers that may be imported by
// third-party dashboard customizations. The plugin edition no longer renders groups.
export const SYSTEM_GROUP_KEY = 'core.navigation.groups.system';
export const EXTENSION_GROUP_KEY = 'core.navigation.groups.extension';

const sidebarItem: menu[] = [
  {
    title: 'core.navigation.botChat',
    icon: markRaw(MessageCircle),
    to: '/chat',
  },
  {
    title: 'core.navigation.botConfig',
    icon: markRaw(Settings2),
    to: '/bot-config/overview',
  },
  {
    title: 'core.navigation.rfqWorkbench',
    icon: markRaw(ClipboardList),
    to: '/workbench',
  },
];

export default sidebarItem;
