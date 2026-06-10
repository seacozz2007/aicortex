import type { LucideIcon } from "lucide-react";
import {
  Home,
  Inbox,
  CircleUser,
  ListTodo,
  FolderKanban,
  Zap,
  Bot,
  Users,
  BarChart3,
  MessageSquare,
  Terminal,
  Video,
  Building2,
  Clock,
  Palette,
} from "lucide-react";
import type { WorkspacePaths } from "../paths/paths";

export type NavKey =
  | "home"
  | "inbox"
  | "myIssues"
  | "recent"
  | "issues"
  | "projects"
  | "autopilots"
  | "agents"
  | "squads"
  | "explore"
  | "usage"
  | "chat"
  | "designStudio"
  | "dev"
  | "meetings"
  | "office"
  | "forum";

export interface NavItemDef {
  key: NavKey;
  resolveHref: (p: WorkspacePaths) => string;
  icon: LucideIcon;
  /** Key under layout.nav — e.g. "home", "my_issues". */
  labelKey: string;
  requiresDesignStudio?: boolean;
  requiresForum?: boolean;
  requiresExplore?: boolean;
}

export interface NavGroupDef {
  id: string;
  /** Key under layout.nav.group — e.g. "work". Omit for direct groups. */
  groupLabelKey?: string;
  items: NavItemDef[];
  direct?: boolean;
}

const item = (
  key: NavKey,
  resolveHref: (p: WorkspacePaths) => string,
  icon: LucideIcon,
  labelKey: string,
  opts?: { requiresDesignStudio?: boolean; requiresForum?: boolean; requiresExplore?: boolean },
): NavItemDef => ({
  key,
  resolveHref,
  icon,
  labelKey,
  ...opts,
});

export const WORKSPACE_NAV_GROUPS: NavGroupDef[] = [
  {
    id: "home",
    direct: true,
    items: [item("home", (p) => p.home(), Home, "home")],
  },
  {
    id: "work",
    groupLabelKey: "work",
    items: [
      item("inbox", (p) => p.inbox(), Inbox, "inbox"),
      item("myIssues", (p) => p.myIssues(), CircleUser, "my_issues"),
      item("issues", (p) => p.issues(), ListTodo, "issues"),
      item("projects", (p) => p.projects(), FolderKanban, "projects"),
      item("recent", (p) => p.recent(), Clock, "recent"),
    ],
  },
  {
    id: "agents",
    groupLabelKey: "agents",
    items: [
      item("agents", (p) => p.agents(), Bot, "agents"),
      item("autopilots", (p) => p.autopilots(), Zap, "autopilots"),
      item("squads", (p) => p.squads(), Users, "squads"),
      item("explore", (p) => p.explore(), Terminal, "explore", { requiresExplore: true }),
      item("usage", (p) => p.usage(), BarChart3, "usage"),
    ],
  },
  {
    id: "create",
    groupLabelKey: "create",
    items: [
      item("chat", (p) => p.chat(), MessageSquare, "chat"),
      item("designStudio", (p) => p.design(), Palette, "design_studio", {
        requiresDesignStudio: true,
      }),
      item("dev", (p) => p.dev(), Terminal, "dev_studio"),
    ],
  },
  {
    id: "more",
    groupLabelKey: "more",
    items: [
      item("meetings", (p) => p.meetings(), Video, "meetings"),
      item("office", (p) => p.office(), Building2, "office"),
      item("forum", (p) => p.forum(), MessageSquare, "forum", { requiresForum: true }),
    ],
  },
];

export function filterNavItem(
  itemDef: NavItemDef,
  opts: { designStudio: boolean; forumEnabled: boolean; exploreEnabled: boolean },
): boolean {
  if (itemDef.requiresDesignStudio && !opts.designStudio) return false;
  if (itemDef.requiresForum && !opts.forumEnabled) return false;
  if (itemDef.requiresExplore && !opts.exploreEnabled) return false;
  return true;
}

export function resolveNavHref(item: NavItemDef, p: WorkspacePaths): string {
  return item.resolveHref(p);
}

export function isNavItemActive(pathname: string, item: NavItemDef, href: string): boolean {
  if (item.key === "designStudio") {
    return pathname.includes("/design");
  }
  if (item.key === "dev") {
    return pathname.includes("/dev");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavGroupActive(
  pathname: string,
  group: NavGroupDef,
  p: WorkspacePaths,
  opts: { designStudio: boolean; forumEnabled: boolean; exploreEnabled: boolean },
): boolean {
  return group.items.some((navItem) => {
    if (!filterNavItem(navItem, opts)) return false;
    return isNavItemActive(pathname, navItem, resolveNavHref(navItem, p));
  });
}
