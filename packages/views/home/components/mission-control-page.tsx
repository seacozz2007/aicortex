"use client";

import { useMemo } from "react";
import {
  Bot,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Zap,
  ArrowRight,
  ListTodo,
  FolderKanban,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@aicortex/ui/components/ui/skeleton";
import { useWorkspaceId } from "@aicortex/core/hooks";
import { agentListOptions } from "@aicortex/core/workspace/queries";
import { agentTaskSnapshotOptions } from "@aicortex/core/agents/queries";
import { projectListOptions } from "@aicortex/core/projects/queries";
import {
  dashboardRunTimeDailyOptions,
  dashboardAgentRunTimeOptions,
} from "@aicortex/core/dashboard";
import { useWorkspacePresenceMap } from "@aicortex/core/agents/use-agent-presence";
import { useAuthStore } from "@aicortex/core/auth";
import type { Agent, AgentTask } from "@aicortex/core/types";
import type { AgentPresenceDetail } from "@aicortex/core/agents";
import { ActorAvatar } from "../../common/actor-avatar";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import { useWorkspacePaths } from "@aicortex/core/paths";

export function MissionControlPage() {
  const { t } = useT("common");
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const user = useAuthStore((s) => s.user);

  const { data: agents } = useQuery(agentListOptions(wsId));
  const { data: taskSnapshot } = useQuery(agentTaskSnapshotOptions(wsId));
  const { data: dailyData } = useQuery(dashboardRunTimeDailyOptions(wsId, 30, null));
  const { data: agentRunTime } = useQuery(dashboardAgentRunTimeOptions(wsId, 7, null));
  const { data: projects } = useQuery(projectListOptions(wsId));
  const { byAgent } = useWorkspacePresenceMap(wsId);

  const activeAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter((a) => !a.archived_at);
  }, [agents]);

  const workingAgents = useMemo(() => {
    return activeAgents.filter((a) => byAgent.get(a.id)?.workload === "working");
  }, [activeAgents, byAgent]);

  const stats = useMemo(() => {
    if (!agentRunTime) return { tasks: 0, failed: 0, hours: 0, successRate: 0 };
    const tasks = agentRunTime.reduce((s, r) => s + r.task_count, 0);
    const failed = agentRunTime.reduce((s, r) => s + r.failed_count, 0);
    const hours = agentRunTime.reduce((s, r) => s + r.total_seconds, 0) / 3600;
    const successRate = tasks > 0 ? Math.round(((tasks - failed) / tasks) * 100) : 0;
    return { tasks, failed, hours, successRate };
  }, [agentRunTime]);

  const chartData = useMemo(() => {
    if (!dailyData) return [];
    // Sort by date ascending, take last 14 days. Display date as M/D directly
    // from the API (UTC-based). No timezone conversion — the backend aggregates
    // by UTC day, so we show it as-is to avoid confusion.
    const sorted = [...dailyData].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-14).map((d) => {
      const parts = d.date.split("-");
      return {
        date: `${parseInt(parts[1]!)}/${parseInt(parts[2]!)}`,
        tasks: d.task_count,
        hours: +(d.total_seconds / 3600).toFixed(1),
      };
    });
  }, [dailyData]);

  const recentTasks = useMemo(() => {
    if (!taskSnapshot) return [];
    const terminal = taskSnapshot.filter(
      (t: AgentTask) => t.status === "completed" || t.status === "failed"
    );
    return terminal
      .sort((a: AgentTask, b: AgentTask) =>
        (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at)
      )
      .slice(0, 10);
  }, [taskSnapshot]);

  const activeTasks = useMemo(() => {
    if (!taskSnapshot) return [];
    return taskSnapshot.filter((t: AgentTask) => t.status === "running" || t.status === "queued");
  }, [taskSnapshot]);

  const greeting = getGreeting();
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-8 p-6 pb-12">
        {/* Hero greeting */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {workingAgents.length > 0
              ? `${workingAgents.length} agent${workingAgents.length > 1 ? "s" : ""} working right now · ${stats.tasks} tasks completed this week`
              : `${activeAgents.length} agents ready · ${stats.tasks} tasks completed this week`}
          </p>
        </div>

        {/* Live status banner — only when agents are working */}
        {activeTasks.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-brand/5 p-4 ring-1 ring-brand/20">
            <div className="flex size-8 items-center justify-center rounded-full bg-brand/10">
              <Zap className="size-4 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {t(($) => $.missionControl.tasks_in_progress, { count: activeTasks.length })}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {activeTasks.slice(0, 3).map((t: AgentTask) => {
                  const agent = activeAgents.find((a) => a.id === t.agent_id);
                  return agent?.name ?? "Agent";
                }).join(", ")}
                {activeTasks.length > 3 ? ` +${activeTasks.length - 3} more` : ""}
              </p>
            </div>
            <AppLink href={p.agents()}>
              <span className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                {t(($) => $.missionControl.view)} <ArrowRight className="size-3" />
              </span>
            </AppLink>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            icon={<CheckCircle2 className="size-4 text-success" />}
            label={t(($) => $.missionControl.completed_7d)}
            value={stats.tasks}
            loading={!agentRunTime}
          />
          <StatCard
            icon={<Clock className="size-4 text-brand" />}
            label={t(($) => $.missionControl.run_time_7d)}
            value={stats.tasks}
            loading={!agentRunTime}
          />
          <StatCard
            icon={<Clock className="size-4 text-brand" />}
            label={t(($) => $.missionControl.run_time_7d)}
            value={`${stats.hours.toFixed(1)}h`}
            loading={!agentRunTime}
          />
          <StatCard
            icon={<TrendingUp className="size-4 text-success" />}
            label={t(($) => $.missionControl.success_rate)}
            value={`${stats.successRate}%`}
            loading={!agentRunTime}
          />
          <StatCard
            icon={<Bot className="size-4 text-brand" />}
            label={t(($) => $.missionControl.online_agents)}
            value={`${activeAgents.filter((a) => byAgent.get(a.id)?.availability === "online").length}/${activeAgents.length}`}
            loading={!agents}
          />
        </div>

        {/* Main content: 3-column grid */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Activity chart */}
          <div className="space-y-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{t(($) => $.missionControl.activity_14d)}</h2>
              <AppLink href={p.usage()}>
                <span className="text-xs text-muted-foreground hover:text-foreground">
                  {t(($) => $.missionControl.details)}
                </span>
              </AppLink>
            </div>
            <div className="h-48 rounded-xl bg-card p-4 ring-1 ring-border">
              {!dailyData ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="taskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.65 0.20 285)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="oklch(0.65 0.20 285)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      className="fill-muted-foreground"
                      interval="preserveStartEnd"
                    />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.16 0.006 285)",
                        border: "1px solid oklch(0.65 0.05 285 / 10%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "oklch(0.7 0 0)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="tasks"
                      stroke="oklch(0.65 0.20 285)"
                      strokeWidth={2}
                      fill="url(#taskGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Per-agent run time bar chart */}
            {agentRunTime && agentRunTime.length > 0 && (
              <div className="h-32 rounded-xl bg-card p-4 ring-1 ring-border">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={agentRunTime.slice(0, 5).map((r) => ({
                      name: activeAgents.find((a) => a.id === r.agent_id)?.name?.slice(0, 8) ?? "?",
                      tasks: r.task_count,
                    }))}
                    layout="vertical"
                    margin={{ right: 30 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      cursor={{ fill: "oklch(0.65 0.05 285 / 10%)" }}
                      contentStyle={{
                        background: "oklch(0.16 0.006 285)",
                        border: "1px solid oklch(0.65 0.05 285 / 10%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "oklch(0.7 0 0)" }}
                    />
                    <Bar dataKey="tasks" fill="oklch(0.65 0.20 285)" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "oklch(0.7 0 0)" }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Center: Agent fleet */}
          <div className="space-y-4 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{t(($) => $.missionControl.agents_header)}</h2>
              <AppLink href={p.agents()}>
                <span className="text-xs text-muted-foreground hover:text-foreground">
                  {t(($) => $.missionControl.all)}
                </span>
              </AppLink>
            </div>
            <div className="space-y-2">
              {!agents ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))
              ) : activeAgents.length === 0 ? (
                <EmptyState
                  icon={<Bot className="size-5" />}
                  title="No agents yet"
                  description="Add an agent to start automating"
                  href={p.agents()}
                />
              ) : (
                activeAgents.slice(0, 5).map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    presence={byAgent.get(agent.id)}
                    activeTasks={taskSnapshot?.filter(
                      (t: AgentTask) => t.agent_id === agent.id && t.status === "running"
                    )}
                    href={p.agentDetail(agent.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right: Recent activity + quick links */}
          <div className="space-y-4 lg:col-span-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{t(($) => $.missionControl.recent_activity)}</h2>
            </div>
            <div className="rounded-xl bg-card ring-1 ring-border">
              {!taskSnapshot ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : recentTasks.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<Zap className="size-5" />}
                    title="No activity yet"
                    description="Assign an issue to an agent to get started"
                    href={p.issues()}
                  />
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentTasks.map((task: AgentTask) => (
                    <EventRow key={task.id} task={task} agents={activeAgents} />
                  ))}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-2">
              <QuickLink
                icon={<ListTodo className="size-4" />}
                label="Issues"
                href={p.issues()}
              />
              <QuickLink
                icon={<FolderKanban className="size-4" />}
                label="Projects"
                count={projects?.length}
                href={p.projects()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</p>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  presence,
  activeTasks,
  href,
}: {
  agent: Agent;
  presence: AgentPresenceDetail | undefined;
  activeTasks: AgentTask[] | undefined;
  href: string;
}) {
  const isWorking = presence?.workload === "working";
  const availability = presence?.availability ?? "offline";

  const statusColor =
    availability === "online"
      ? "bg-success"
      : availability === "unstable"
        ? "bg-warning"
        : "bg-muted-foreground/40";

  return (
    <AppLink href={href}>
      <div className="flex items-center gap-3 rounded-lg bg-card p-3 ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-brand/20">
        <div className="relative">
          <ActorAvatar actorType="agent" actorId={agent.id} size={28} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card ${statusColor}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {isWorking && activeTasks?.length
              ? `Working · ${activeTasks.length} task${activeTasks.length > 1 ? "s" : ""}`
              : availability === "online"
                ? "Idle"
                : availability}
          </p>
        </div>
        {isWorking && (
          <span className="size-2 animate-pulse rounded-full bg-brand" />
        )}
      </div>
    </AppLink>
  );
}

function EventRow({ task, agents }: { task: AgentTask; agents: Agent[] }) {
  const agent = agents.find((a) => a.id === task.agent_id);
  const isSuccess = task.status === "completed";
  const time = task.completed_at ?? task.created_at;
  const relative = getRelativeTime(time);

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/30">
      {isSuccess ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-success" />
      ) : (
        <AlertCircle className="size-3.5 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {task.trigger_summary || (isSuccess ? "Task completed" : "Task failed")}
        </p>
        <p className="text-xs text-muted-foreground">{agent?.name ?? "Agent"}</p>
      </div>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {relative}
      </span>
    </div>
  );
}

function QuickLink({
  icon,
  label,
  count,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  href: string;
}) {
  return (
    <AppLink href={href}>
      <div className="flex items-center gap-2.5 rounded-lg bg-card p-3 ring-1 ring-border transition-all hover:-translate-y-0.5 hover:ring-brand/20">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
        {count != null && (
          <span className="ml-auto font-mono text-xs text-muted-foreground">{count}</span>
        )}
      </div>
    </AppLink>
  );
}

function EmptyState({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <AppLink href={href}>
      <div className="flex flex-col items-center gap-2 py-6 text-center transition-colors hover:text-brand">
        <span className="text-muted-foreground">{icon}</span>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </AppLink>
  );
}

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
