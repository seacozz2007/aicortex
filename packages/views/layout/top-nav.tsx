"use client";

import { useState } from "react";
import { useIsMobile } from "@aicortex/ui/hooks/use-mobile";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@aicortex/ui/components/ui/sheet";
import { cn } from "@aicortex/ui/lib/utils";
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
  Search,
  SquarePen,
  ChevronDown,
  User,
  Settings,
  Monitor,
  BookOpenText,
  FolderGit2,
  Plug,
  FlaskConical,
  Bell,
  Key,
  SlidersHorizontal,
  LogOut,
  Menu,
  Check,
  MessageSquare,
  Plus,
  Building2,
  Terminal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aicortex/ui/components/ui/dropdown-menu";
import { AppLink, useNavigation } from "../navigation";
import { useWorkspacePaths, useCurrentWorkspace, paths } from "@aicortex/core/paths";
import { useAuthStore } from "@aicortex/core/auth";
import { useQuery } from "@tanstack/react-query";
import { workspaceListOptions } from "@aicortex/core/workspace/queries";
import { ActorAvatar } from "@aicortex/ui/components/common/actor-avatar";
import { AICortexIcon } from "@aicortex/ui/components/common/aicortex-icon";
import { WorkspaceAvatar } from "../workspace/workspace-avatar";
import { openCreateIssueWithPreference } from "@aicortex/core/issues/stores/create-mode-store";
import { useSearchStore } from "../search/search-store";
import { useLogout } from "../auth";
import { useT } from "../i18n";
import { useModalStore } from "@aicortex/core/modals";

interface TopNavProps {
  className?: string;
}

export function TopNav({ className }: TopNavProps) {
  const { t } = useT("layout");
  const { pathname } = useNavigation();
  const p = useWorkspacePaths();
  const user = useAuthStore((s) => s.user);
  const workspace = useCurrentWorkspace();
  const { data: workspaces = [] } = useQuery(workspaceListOptions());
  const logout = useLogout();

  const settings = (workspace?.settings as Record<string, unknown>) ?? {};

  const isMobile = useIsMobile();
  const [navSheetOpen, setNavSheetOpen] = useState(false);

  const navItems = [
    { key: "home", label: t(($) => $.nav.home), href: p.home(), icon: Home },
    { key: "inbox", label: t(($) => $.nav.inbox), href: p.inbox(), icon: Inbox },
    { key: "my-issues", label: t(($) => $.nav.my_issues), href: p.myIssues(), icon: CircleUser },
    { key: "issues", label: t(($) => $.nav.issues), href: p.issues(), icon: ListTodo },
    { key: "projects", label: t(($) => $.nav.projects), href: p.projects(), icon: FolderKanban },
    { key: "autopilots", label: t(($) => $.nav.autopilots), href: p.autopilots(), icon: Zap },
    { key: "agents", label: t(($) => $.nav.agents), href: p.agents(), icon: Bot },
    { key: "explore", label: t(($) => $.nav.explore), href: p.explore(), icon: Terminal },
    { key: "office", label: t(($) => $.nav.office), href: p.office(), icon: Building2 },
    ...(settings.forum_enabled === true
      ? [{ key: "forum", label: t(($) => $.nav.forum), href: p.forum(), icon: MessageSquare }]
      : []),
    { key: "squads", label: t(($) => $.nav.squads), href: p.squads(), icon: Users },
    { key: "usage", label: t(($) => $.nav.usage), href: p.usage(), icon: BarChart3 },
  ];

  return (
    <header className={cn("flex h-12 shrink-0 items-center border-b bg-card px-4", className)}>
      {/* Left: Logo + Workspace Switcher + Nav */}
      <div className="flex items-center gap-1">
        {/* Mobile hamburger */}
        {isMobile && (
          <Sheet open={navSheetOpen} onOpenChange={setNavSheetOpen}>
            <SheetTrigger
              render={
                <button
                  type="button"
                  className="inline-flex items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-4" />
                </button>
              }
            />
            <SheetContent side="left" className="w-64 p-4">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 pt-6">
                {[
                  ...navItems,
                  { key: "chat", label: t(($) => $.nav.chat), href: p.chat(), icon: MessageSquare },
                ].map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <AppLink
                      key={item.key}
                      href={item.href}
                      onClick={() => setNavSheetOpen(false)}
                    >
                      <span
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground",
                          isActive
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        <item.icon className="size-4" />
                        {item.label}
                      </span>
                    </AppLink>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        )}
        <AppLink href={p.home()}>
          <AICortexIcon className="mr-2 size-5" />
        </AppLink>

        {/* Workspace Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="mr-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-accent"
              >
                <WorkspaceAvatar name={workspace?.name ?? "W"} size="sm" />
                <span className="max-w-[120px] truncate">{workspace?.name}</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t(($) => $.sidebar.workspaces_label)}</DropdownMenuLabel>
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  render={<AppLink href={paths.workspace(ws.slug).home()} />}
                >
                  <WorkspaceAvatar name={ws.name} size="sm" />
                  <span className="flex-1 truncate">{ws.name}</span>
                  {ws.id === workspace?.id && (
                    <Check className="size-3.5 text-brand" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => useModalStore.getState().open("create-workspace")}
              >
                <Plus className="size-3.5" />
                {t(($) => $.sidebar.create_workspace)}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {!isMobile && (
          <>
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <AppLink key={item.key} href={item.href}>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
                      isActive
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    <item.icon className="size-3.5" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </span>
                </AppLink>
              );
            })}

            {/* Chat entry */}
            <AppLink href={p.chat()}>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
                  pathname.startsWith(p.chat())
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                <MessageSquare className="size-3.5" />
                <span className="hidden lg:inline">{t(($) => $.nav.chat)}</span>
              </span>
            </AppLink>
          </>
        )}
      </div>

      {/* Right: Search + New Issue + User menu */}
      <div className="ml-auto flex items-center gap-2">
        {/* Search */}
        <button
          type="button"
          onClick={() => useSearchStore.getState().setOpen(true)}
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">{t(($) => $.topnav.search)}</span>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <kbd className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>

        {/* New Issue */}
        <button
          type="button"
          onClick={() => openCreateIssueWithPreference()}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
        >
          <SquarePen className="size-3.5" />
          <span className="hidden sm:inline">{t(($) => $.topnav.new_issue)}</span>
        </button>

        {/* User dropdown (我的) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-accent"
              >
                <ActorAvatar
                  name={user?.name ?? ""}
                  initials={user?.name?.charAt(0) ?? "U"}
                  avatarUrl={user?.avatar_url ?? null}
                  size={24}
                />
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            {/* My Account */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t(($) => $.topnav.my_account)}</DropdownMenuLabel>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=profile`} />}>
                <User className="size-4" />
                {t(($) => $.topnav.profile)}
              </DropdownMenuItem>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=preferences`} />}>
                <SlidersHorizontal className="size-4" />
                {t(($) => $.topnav.preferences)}
              </DropdownMenuItem>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=notifications`} />}>
                <Bell className="size-4" />
                {t(($) => $.topnav.notifications)}
              </DropdownMenuItem>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=tokens`} />}>
                <Key className="size-4" />
                {t(($) => $.topnav.tokens)}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/* Workspace Settings */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t(($) => $.topnav.workspace_settings)}</DropdownMenuLabel>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=workspace`} />}>
                <Settings className="size-4" />
                {t(($) => $.topnav.general)}
              </DropdownMenuItem>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=repositories`} />}>
                <FolderGit2 className="size-4" />
                {t(($) => $.topnav.repositories)}
              </DropdownMenuItem>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=integrations`} />}>
                <Plug className="size-4" />
                {t(($) => $.topnav.integrations)}
              </DropdownMenuItem>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=labs`} />}>
                <FlaskConical className="size-4" />
                {t(($) => $.topnav.labs)}
              </DropdownMenuItem>
              <DropdownMenuItem render={<AppLink href={`${p.settings()}?tab=members`} />}>
                <Users className="size-4" />
                {t(($) => $.topnav.members)}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/* System Settings */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t(($) => $.topnav.system_settings)}</DropdownMenuLabel>
              <DropdownMenuItem render={<AppLink href={p.runtimes()} />}>
                <Monitor className="size-4" />
                {t(($) => $.nav.runtimes)}
              </DropdownMenuItem>
              <DropdownMenuItem render={<AppLink href={p.skills()} />}>
                <BookOpenText className="size-4" />
                {t(($) => $.nav.skills)}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={logout}>
              <LogOut className="size-4" />
              {t(($) => $.topnav.logout)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
