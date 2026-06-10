"use client";

import { Check } from "lucide-react";
import { cn } from "@aicortex/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aicortex/ui/components/ui/dropdown-menu";
import {
  WORKSPACE_NAV_GROUPS,
  filterNavItem,
  isNavGroupActive,
  isNavItemActive,
  resolveNavHref,
} from "@aicortex/core/nav/workspace-nav";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { AppLink, useNavigation } from "../navigation";
import { useT } from "../i18n";

export function WorkspaceNavMenu({
  designStudio,
  forumEnabled,
  exploreEnabled,
  onNavigate,
}: {
  designStudio: boolean;
  forumEnabled: boolean;
  exploreEnabled: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useT("layout");
  const p = useWorkspacePaths();
  const { pathname } = useNavigation();
  const filterOpts = { designStudio, forumEnabled, exploreEnabled };

  return (
    <>
      {WORKSPACE_NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => filterNavItem(item, filterOpts));
        if (items.length === 0) return null;

        if (group.direct) {
          const item = items[0]!;
          const href = resolveNavHref(item, p);
          const active = isNavItemActive(pathname, item, href);
          return (
            <AppLink key={group.id} href={href} onClick={onNavigate}>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
                  active ? "bg-accent text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-3.5" />
                <span className="hidden lg:inline">
                  {t(($) => $.nav[item.labelKey as keyof typeof $.nav] as string)}
                </span>
              </span>
            </AppLink>
          );
        }

        const active = isNavGroupActive(pathname, group, p, filterOpts);
        const groupLabel = group.groupLabelKey
          ? t(($) => $.nav.group[group.groupLabelKey as keyof typeof $.nav.group])
          : "";

        return (
          <DropdownMenu key={group.id}>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
                    active
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {groupLabel}
                </button>
              }
            />
            <DropdownMenuContent align="start" className="w-48">
              {items.map((item) => {
                const href = resolveNavHref(item, p);
                const itemActive = isNavItemActive(pathname, item, href);
                return (
                  <DropdownMenuItem key={item.key} render={<AppLink href={href} onClick={onNavigate} />}>
                    <item.icon className="size-4" />
                    <span className="flex-1">
                      {t(($) => $.nav[item.labelKey as keyof typeof $.nav] as string)}
                    </span>
                    {itemActive && <Check className="size-3.5 text-brand" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </>
  );
}
