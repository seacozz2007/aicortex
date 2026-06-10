"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Plus, Search, Terminal } from "lucide-react";
import { projectListOptions } from "@aicortex/core/projects/queries";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { useWorkspacePaths } from "@aicortex/core/paths";
import { useModalStore } from "@aicortex/core/modals";
import { Button } from "@aicortex/ui/components/ui/button";
import { Input } from "@aicortex/ui/components/ui/input";
import { Skeleton } from "@aicortex/ui/components/ui/skeleton";
import { AppLink } from "../../navigation";
import { PageHeader } from "../../layout/page-header";
import { ProjectIcon } from "../../projects/components/project-icon";
import { useT } from "../../i18n";
import { matchesPinyin } from "../../editor/extensions/pinyin-match";

export function DevProjectPicker() {
  const { t } = useT("dev-studio");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const openModal = useModalStore((s) => s.open);
  const { data: projects = [], isLoading } = useQuery(projectListOptions(wsId));
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (project) =>
        project.title.toLowerCase().includes(q) ||
        matchesPinyin(project.title, q),
    );
  }, [projects, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader className="gap-2 bg-background text-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Terminal className="size-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{t(($) => $.picker.title)}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {t(($) => $.picker.subtitle)}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => openModal("create-project")}
        >
          <Plus className="size-3.5" />
          {t(($) => $.picker.new_project)}
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(($) => $.picker.search_placeholder)}
            className="h-9 pl-8 text-sm"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <FolderKanban className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {projects.length === 0
                ? t(($) => $.picker.empty)
                : t(($) => $.picker.no_results)}
            </p>
            {projects.length === 0 && (
              <Button size="sm" onClick={() => openModal("create-project")}>
                <Plus className="size-3.5" />
                {t(($) => $.picker.create_first)}
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <li key={project.id}>
                <AppLink
                  href={p.projectDev(project.id)}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <ProjectIcon project={project} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{project.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(($) => $.picker.open_studio)}
                    </p>
                  </div>
                </AppLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
