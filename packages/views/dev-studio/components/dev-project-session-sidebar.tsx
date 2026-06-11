"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ChevronDown,
  ChevronRight,
  FolderKanban,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import {
  emptyProjectSessionLayout,
  mergeSessionLayout,
  reorderSessionIds,
  sortDevProjectSessions,
  togglePinnedSession,
  type DevProjectSessionLayout,
  type DevSessionLayoutByProject,
} from "@aicortex/core/dev-studio";
import { cn } from "@aicortex/ui/lib/utils";
import type { DevSession } from "@aicortex/core/dev-studio";
import type { Project } from "@aicortex/core/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@aicortex/ui/components/ui/alert-dialog";
import { Button } from "@aicortex/ui/components/ui/button";
import { useT } from "../../i18n";
import { ProjectIcon } from "../../projects/components/project-icon";
import { DevSessionRow } from "./dev-session-row";

export function DevProjectSessionSidebar({
  projects,
  sessions,
  selectedProjectId,
  activeSessionId,
  openedProjectIds,
  sessionLayoutByProject,
  sidebarOpen,
  deletePending,
  onToggleSidebar,
  onSelectProject,
  onSelectSession,
  onNewSession,
  onOpenProject,
  onSessionLayoutChange,
  onArchiveSession,
}: {
  projects: Project[];
  sessions: DevSession[];
  openedProjectIds: string[];
  sessionLayoutByProject: DevSessionLayoutByProject;
  selectedProjectId: string | null;
  activeSessionId: string | null;
  sidebarOpen: boolean;
  deletePending: boolean;
  onToggleSidebar: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectSession: (projectId: string, sessionId: string) => void;
  onNewSession: (projectId: string) => void;
  onOpenProject: () => void;
  onSessionLayoutChange: (projectId: string, layout: DevProjectSessionLayout) => void;
  onArchiveSession: (session: DevSession) => void;
}) {
  const { t } = useT("dev-studio");
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<string[]>([]);
  const [pendingArchive, setPendingArchive] = useState<DevSession | null>(null);

  useEffect(() => {
    if (!deletePending && pendingArchive) setPendingArchive(null);
  }, [deletePending, pendingArchive]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  };

  const isProjectExpanded = (projectId: string, sessionCount: number) => {
    if (collapsedProjectIds.includes(projectId)) return false;
    return (
      openedProjectIds.includes(projectId) ||
      selectedProjectId === projectId ||
      sessionCount > 0
    );
  };

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, DevSession[]>();
    for (const session of sessions) {
      const list = map.get(session.project_id) ?? [];
      list.push(session);
      map.set(session.project_id, list);
    }
    return map;
  }, [sessions]);

  const projectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of openedProjectIds) {
      if (projectMap.has(id)) ids.add(id);
    }
    for (const key of grouped.keys()) {
      if (projectMap.has(key)) ids.add(key);
    }
    if (selectedProjectId && projectMap.has(selectedProjectId)) ids.add(selectedProjectId);
    return Array.from(ids).sort((a, b) => {
      const ta = projectMap.get(a)?.title ?? a;
      const tb = projectMap.get(b)?.title ?? b;
      return ta.localeCompare(tb);
    });
  }, [grouped, openedProjectIds, projectMap, selectedProjectId]);

  const sortedSessionsByProject = useMemo(() => {
    const result = new Map<string, DevSession[]>();
    for (const [projectId, projectSessions] of grouped) {
      const layout = mergeSessionLayout(
        projectSessions,
        sessionLayoutByProject[projectId] ?? emptyProjectSessionLayout(),
      );
      result.set(projectId, sortDevProjectSessions(projectSessions, layout));
    }
    return result;
  }, [grouped, sessionLayoutByProject]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const projectId = String(active.data.current?.projectId ?? "");
    if (!projectId) return;

    const projectSessions = grouped.get(projectId) ?? [];
    const layout = mergeSessionLayout(
      projectSessions,
      sessionLayoutByProject[projectId] ?? emptyProjectSessionLayout(),
    );
    const sorted = sortDevProjectSessions(projectSessions, layout);
    const orderedIds = sorted.map((s) => s.id);
    const nextOrder = reorderSessionIds(orderedIds, String(active.id), String(over.id));
    onSessionLayoutChange(projectId, { ...layout, order: nextOrder });
  };

  const handleTogglePin = (projectId: string, sessionId: string) => {
    const projectSessions = grouped.get(projectId) ?? [];
    const layout = mergeSessionLayout(
      projectSessions,
      sessionLayoutByProject[projectId] ?? emptyProjectSessionLayout(),
    );
    onSessionLayoutChange(projectId, togglePinnedSession(layout, sessionId));
  };

  if (!sidebarOpen) {
    return (
      <div className="flex w-10 shrink-0 flex-col border-r bg-sidebar">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="m-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t(($) => $.shell.expand_sidebar)}
        >
          <PanelLeftOpen className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-12 items-center justify-between border-b px-3">
          <h2 className="text-sm font-medium">{t(($) => $.shell.projects_title)}</h2>
          <div className="flex items-center gap-0.5">
            {selectedProjectId && (
              <button
                type="button"
                onClick={() => onNewSession(selectedProjectId)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={t(($) => $.shell.new_session)}
              >
                <Plus className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleSidebar}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t(($) => $.shell.collapse_sidebar)}
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {projectIds.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
              <FolderKanban className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t(($) => $.shell.no_sessions)}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {projectIds.map((projectId) => {
                const project = projectMap.get(projectId);
                const projectSessions = sortedSessionsByProject.get(projectId) ?? [];
                const layout = mergeSessionLayout(
                  grouped.get(projectId) ?? [],
                  sessionLayoutByProject[projectId] ?? emptyProjectSessionLayout(),
                );
                const expanded = isProjectExpanded(projectId, projectSessions.length);
                return (
                  <div key={projectId}>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleProjectCollapsed(projectId)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent"
                      >
                        {expanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectProject(projectId)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                          selectedProjectId === projectId && "bg-accent/70 font-medium",
                        )}
                      >
                        {project ? (
                          <ProjectIcon project={project} size="sm" />
                        ) : (
                          <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{project?.title ?? projectId}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNewSession(projectId)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent"
                        title={t(($) => $.shell.new_session)}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    {expanded && (
                      <div className="ml-5 mt-0.5 space-y-0.5 border-l pl-1">
                        {projectSessions.length === 0 ? (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">
                            {t(($) => $.shell.project_empty)}
                          </p>
                        ) : (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                          >
                            <SortableContext
                              items={projectSessions.map((s) => s.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {projectSessions.map((session) => (
                                <DevSessionRow
                                  key={session.id}
                                  session={session}
                                  projectId={projectId}
                                  isActive={activeSessionId === session.id}
                                  isPinned={layout.pinned.includes(session.id)}
                                  onSelect={() => onSelectSession(projectId, session.id)}
                                  onTogglePin={() => handleTogglePin(projectId, session.id)}
                                  onArchive={() => setPendingArchive(session)}
                                />
                              ))}
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t p-2">
          <button
            type="button"
            onClick={onOpenProject}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FolderKanban className="size-4" />
            {t(($) => $.shell.open_project)}
          </button>
        </div>
      </aside>

      <AlertDialog
        open={!!pendingArchive}
        onOpenChange={(open) => {
          if (!open && !deletePending) setPendingArchive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.shell.session_archive_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.shell.session_archive_description, {
                title: pendingArchive?.title || t(($) => $.shell.untitled_session),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              {t(($) => $.shell.session_archive_cancel)}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deletePending}
              onClick={() => {
                if (!pendingArchive) return;
                onArchiveSession(pendingArchive);
              }}
            >
              {deletePending
                ? t(($) => $.shell.session_archive_pending)
                : t(($) => $.shell.session_archive_confirm)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
