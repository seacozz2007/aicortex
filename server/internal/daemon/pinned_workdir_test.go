package daemon

import "testing"

func TestIsDesignStudioTask(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		task  Task
		want  bool
	}{
		{
			name: "design mode",
			task: Task{DesignMode: "prototype", ProjectID: "proj-1"},
			want: true,
		},
		{
			name: "session kind design",
			task: Task{SessionKind: "design", ProjectID: "proj-1"},
			want: true,
		},
		{
			name: "engineering chat with project",
			task: Task{SessionKind: "chat", ChatSessionID: "chat-1", ProjectID: "proj-1"},
			want: false,
		},
		{
			name: "issue task with project",
			task: Task{IssueID: "issue-1", ProjectID: "proj-1"},
			want: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isDesignStudioTask(tc.task); got != tc.want {
				t.Fatalf("isDesignStudioTask() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestProjectUsesPinnedWorkdir(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		task Task
		want bool
	}{
		{
			name: "enabled engineering task",
			task: Task{ProjectID: "proj-1", ProjectPinnedWorkdir: true},
			want: true,
		},
		{
			name: "disabled on project",
			task: Task{ProjectID: "proj-1", ProjectPinnedWorkdir: false},
			want: false,
		},
		{
			name: "design studio skips even when enabled",
			task: Task{ProjectID: "proj-1", ProjectPinnedWorkdir: true, DesignMode: "prototype"},
			want: false,
		},
		{
			name: "no project",
			task: Task{ProjectPinnedWorkdir: true},
			want: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := projectUsesPinnedWorkdir(tc.task); got != tc.want {
				t.Fatalf("projectUsesPinnedWorkdir() = %v, want %v", got, tc.want)
			}
		})
	}
}
