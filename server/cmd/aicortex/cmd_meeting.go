package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/aicortex/aicortex/server/internal/cli"
)

const (
	meetingLabelName  = "meeting"
	meetingLabelColor = "#8b5cf6"
	stageIncomplete   = "☐"
	stageComplete     = "☑"
)

// ---------------------------------------------------------------------------
// Meeting commands
// ---------------------------------------------------------------------------

var meetingCmd = &cobra.Command{
	Use:   "meeting",
	Short: "Create and manage multi-agent meetings",
	Long: "Create, list, and manage meeting issues. Meetings are issues with " +
		"the 'meeting' label that track progress through stages (Discussion → " +
		"Decision → Action Items → Summary) in their description.",
}

var meetingCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a meeting issue",
	Long: "Create a new meeting issue with a formatted description template " +
		"and the 'meeting' label.\n\n" +
		"Example:\n" +
		`  aicortex meeting create --title "Sprint Planning" --participants "Alice,Bob" --topic "Q2 roadmap"`,
	RunE: runMeetingCreate,
}

var meetingListCmd = &cobra.Command{
	Use:   "list",
	Short: "List meetings",
	Long: "List all issues with the 'meeting' label. Optionally filter by status.\n\n" +
		"Example:\n" +
		"  aicortex meeting list --status in_progress",
	RunE: runMeetingList,
}

var meetingStatusCmd = &cobra.Command{
	Use:   "status <issue-id>",
	Short: "Show meeting progress",
	Long: "Parse the meeting issue description and display the current " +
		"progress of each stage.\n\n" +
		"Example:\n" +
		"  aicortex meeting status MUL-123",
	Args: exactArgs(1),
	RunE: runMeetingStatus,
}

var meetingAdvanceCmd = &cobra.Command{
	Use:   "advance <issue-id>",
	Short: "Advance meeting to the next stage",
	Long: "Mark the first incomplete stage as complete and advance the meeting.\n\n" +
		"Example:\n" +
		"  aicortex meeting advance MUL-123",
	Args: exactArgs(1),
	RunE: runMeetingAdvance,
}

var meetingSummaryCmd = &cobra.Command{
	Use:   "summary <issue-id>",
	Short: "Append summary to meeting description",
	Long: "Append summary text to the Summary section of the meeting description. " +
		"Supports --content, --content-stdin, and --content-file input modes.\n\n" +
		"Example:\n" +
		"  aicortex meeting summary MUL-123 --content \"Decided to proceed with Phase 2\"",
	Args: exactArgs(1),
	RunE: runMeetingSummary,
}

var meetingCloseCmd = &cobra.Command{
	Use:   "close <issue-id>",
	Short: "Close a meeting",
	Long: "Mark a meeting issue as done.\n\n" +
		"Example:\n" +
		"  aicortex meeting close MUL-123",
	Args: exactArgs(1),
	RunE: runMeetingClose,
}

func init() {
	meetingCmd.AddCommand(meetingCreateCmd)
	meetingCmd.AddCommand(meetingListCmd)
	meetingCmd.AddCommand(meetingStatusCmd)
	meetingCmd.AddCommand(meetingAdvanceCmd)
	meetingCmd.AddCommand(meetingSummaryCmd)
	meetingCmd.AddCommand(meetingCloseCmd)

	// create flags
	meetingCreateCmd.Flags().String("title", "", "Meeting title (required)")
	meetingCreateCmd.Flags().String("participants", "", "Comma-separated participant names (required)")
	meetingCreateCmd.Flags().String("topic", "", "Meeting topic (required)")
	meetingCreateCmd.Flags().String("output", "table", "Output format: table or json")

	// list flags
	meetingListCmd.Flags().String("status", "", "Filter by status: backlog, todo, in_progress, in_review, done, blocked, cancelled")
	meetingListCmd.Flags().String("output", "table", "Output format: table or json")
	meetingListCmd.Flags().Bool("full-id", false, "Show full UUIDs in table output")

	// status flags
	meetingStatusCmd.Flags().String("output", "table", "Output format: table or json")

	// summary flags
	meetingSummaryCmd.Flags().String("content", "", "Summary content (decodes \\n, \\r, \\t; pipe via --content-stdin to preserve literal backslashes)")
	meetingSummaryCmd.Flags().Bool("content-stdin", false, "Read summary content from stdin (preserves multi-line content verbatim)")
	meetingSummaryCmd.Flags().String("content-file", "", "Read summary content from a UTF-8 file (preserves multi-line content verbatim)")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// meetingLabel resolves or creates the "meeting" label and returns its ID.
func meetingLabel(ctx context.Context, client *cli.APIClient) (string, error) {
	var result map[string]any
	if err := client.GetJSON(ctx, "/api/labels?workspace_id="+client.WorkspaceID, &result); err != nil {
		return "", fmt.Errorf("list labels: %w", err)
	}
	labelsRaw, _ := result["labels"].([]any)
	for _, raw := range labelsRaw {
		l, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if strVal(l, "name") == meetingLabelName {
			return strVal(l, "id"), nil
		}
	}

	// Create the meeting label
	body := map[string]any{"name": meetingLabelName, "color": meetingLabelColor}
	var created map[string]any
	if err := client.PostJSON(ctx, "/api/labels", body, &created); err != nil {
		return "", fmt.Errorf("create meeting label: %w", err)
	}
	return strVal(created, "id"), nil
}

// meetingDescription returns the formatted meeting description template.
func meetingDescription(title, topic, participants string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("## Meeting: %s\n\n", title))
	b.WriteString(fmt.Sprintf("**Topic:** %s\n", topic))
	b.WriteString(fmt.Sprintf("**Participants:** %s\n\n", participants))
	b.WriteString("### Stages\n\n")
	b.WriteString("| Stage | Status |\n")
	b.WriteString("|-------|--------|\n")
	b.WriteString(fmt.Sprintf("| Discussion | %s |\n", stageIncomplete))
	b.WriteString(fmt.Sprintf("| Decision | %s |\n", stageIncomplete))
	b.WriteString(fmt.Sprintf("| Action Items | %s |\n", stageIncomplete))
	b.WriteString(fmt.Sprintf("| Summary | %s |\n\n", stageIncomplete))
	b.WriteString("### Notes\n\n")
	b.WriteString("### Action Items\n\n")
	b.WriteString("### Summary\n")
	return b.String()
}

// stageRow represents a single row in the meeting stages table.
type stageRow struct {
	Name   string
	Status string
}

// parseStages extracts the stage table from a meeting description.
func parseStages(desc string) []stageRow {
	lines := strings.Split(desc, "\n")
	var stages []stageRow
	inTable := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "### Stages") || strings.HasPrefix(trimmed, "### Progress") {
			inTable = true
			continue
		}
		if inTable && strings.HasPrefix(trimmed, "### ") {
			break
		}
		if !inTable || !strings.HasPrefix(trimmed, "|") {
			continue
		}
		// Skip header and separator rows
		if strings.Contains(trimmed, "| Stage |") || strings.Contains(trimmed, "|-------") {
			continue
		}
		// Parse data row: | Name | ☐ |
		parts := strings.Split(trimmed, "|")
		if len(parts) < 3 {
			continue
		}
		name := strings.TrimSpace(parts[1])
		status := strings.TrimSpace(parts[2])
		if name == "" {
			continue
		}
		stages = append(stages, stageRow{Name: name, Status: status})
	}
	return stages
}

// advanceStageDescription marks the first incomplete stage as complete and
// returns the updated description and true if any change was made.
func advanceStageDescription(desc string) (string, bool) {
	stages := parseStages(desc)
	if len(stages) == 0 {
		return desc, false
	}

	// Find the first incomplete stage
	targetIdx := -1
	for i, s := range stages {
		if s.Status == stageIncomplete {
			targetIdx = i
			break
		}
	}
	if targetIdx < 0 {
		return desc, false // All stages already complete
	}

	// Replace the first occurrence of stageIncomplete for this stage in the description
	// Find the exact table row for the target stage
	lines := strings.Split(desc, "\n")
	found := 0
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || !strings.HasPrefix(trimmed, "|") {
			continue
		}
		parts := strings.Split(trimmed, "|")
		if len(parts) < 3 {
			continue
		}
		name := strings.TrimSpace(parts[1])
		status := strings.TrimSpace(parts[2])
		if name == stages[targetIdx].Name && status == stageIncomplete {
			// Replace the status in this line
			lines[i] = strings.Replace(line, stageIncomplete, stageComplete, 1)
			found++
			break
		}
	}
	if found == 0 {
		return desc, false
	}
	return strings.Join(lines, "\n"), true
}

// appendToSummary appends content to the "### Summary" section of the description.
func appendToSummary(desc, content string) string {
	summaryHeader := "### Summary"
	idx := strings.Index(desc, summaryHeader)
	if idx < 0 {
		// No summary section, append one
		return desc + "\n\n" + summaryHeader + "\n\n" + content + "\n"
	}

	// Find the content after the summary header
	after := desc[idx+len(summaryHeader):]
	// Find the next section or end
	nextSection := strings.Index(after, "\n### ")
	if nextSection < 0 {
		// No more sections after summary - just append
		existingContent := strings.TrimSpace(after)
		if existingContent == "" {
			return desc + content + "\n"
		}
		// Check if there's already content
		return desc + "\n" + content + "\n"
	}

	// There's content between Summary header and next section
	sectionContent := after[:nextSection]
	trimmedContent := strings.TrimSpace(sectionContent)
	if trimmedContent == "" {
		// Empty section, insert before next section
		insertAt := idx + len(summaryHeader)
		return desc[:insertAt] + "\n" + content + "\n" + desc[insertAt:]
	}

	// Non-empty section, append before next section
	insertAt := idx + len(summaryHeader) + nextSection
	return desc[:insertAt] + "\n" + content + "\n" + desc[insertAt:]
}

// ---------------------------------------------------------------------------
// Command runners
// ---------------------------------------------------------------------------

func runMeetingCreate(cmd *cobra.Command, _ []string) error {
	title, _ := cmd.Flags().GetString("title")
	participants, _ := cmd.Flags().GetString("participants")
	topic, _ := cmd.Flags().GetString("topic")

	if title == "" {
		return fmt.Errorf("--title is required")
	}
	if participants == "" {
		return fmt.Errorf("--participants is required")
	}
	if topic == "" {
		return fmt.Errorf("--topic is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if client.WorkspaceID == "" {
		if _, err := requireWorkspaceID(cmd); err != nil {
			return err
		}
	}

	// Resolve or create the meeting label
	labelID, err := meetingLabel(ctx, client)
	if err != nil {
		return fmt.Errorf("resolve meeting label: %w", err)
	}

	// Create the issue
	desc := meetingDescription(title, topic, participants)
	body := map[string]any{
		"title":       title,
		"description": desc,
	}
	var issue map[string]any
	if err := client.PostJSON(ctx, "/api/issues", body, &issue); err != nil {
		return fmt.Errorf("create meeting issue: %w", err)
	}

	issueID := strVal(issue, "id")
	if issueID == "" {
		return fmt.Errorf("create meeting: response missing issue id")
	}

	// Attach meeting label
	labelBody := map[string]any{"label_id": labelID}
	var labelResult map[string]any
	if err := client.PostJSON(ctx, "/api/issues/"+issueID+"/labels", labelBody, &labelResult); err != nil {
		return fmt.Errorf("attach meeting label: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, issue)
	}

	key := issueDisplayKey(issue)
	fmt.Fprintf(os.Stdout, "Meeting created: %s\n", key)
	return nil
}

func runMeetingList(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if client.WorkspaceID == "" {
		if _, err := requireWorkspaceID(cmd); err != nil {
			return err
		}
	}

	// Resolve the meeting label ID for client-side filtering
	labelID, err := meetingLabel(ctx, client)
	if err != nil {
		return fmt.Errorf("resolve meeting label: %w", err)
	}

	// Build query params — the server returns labels in each issue response,
	// so we filter by the meeting label client-side. Include the label_ids
	// param as a best-effort server-side optimization for servers that support it.
	params := fmt.Sprintf("workspace_id=%s&label_ids=%s", client.WorkspaceID, labelID)
	if v, _ := cmd.Flags().GetString("status"); v != "" {
		params += "&status=" + v
	}

	path := "/api/issues?" + params
	var result map[string]any
	if err := client.GetJSON(ctx, path, &result); err != nil {
		return fmt.Errorf("list meetings: %w", err)
	}

	issuesRaw, _ := result["issues"].([]any)

	// Client-side filter by meeting label (for servers that don't support
	// server-side label_ids filtering)
	filtered := make([]any, 0, len(issuesRaw))
	for _, raw := range issuesRaw {
		issue, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if hasMeetingLabel(issue, labelID) {
			filtered = append(filtered, issue)
		}
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, map[string]any{"issues": filtered})
	}

	fullID, _ := cmd.Flags().GetBool("full-id")
	actors := loadActorDisplayLookup(ctx, client)
	headers := []string{"KEY", "TITLE", "STATUS", "ASSIGNEE"}
	if fullID {
		headers = []string{"KEY", "ID", "TITLE", "STATUS", "ASSIGNEE"}
	}
	rows := make([][]string, 0, len(filtered))
	for _, raw := range filtered {
		issue, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		assignee := formatAssignee(issue, actors)
		row := []string{
			issueDisplayKey(issue),
			strVal(issue, "title"),
			strVal(issue, "status"),
			assignee,
		}
		if fullID {
			row = []string{
				issueDisplayKey(issue),
				strVal(issue, "id"),
				strVal(issue, "title"),
				strVal(issue, "status"),
				assignee,
			}
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		fmt.Fprintln(os.Stdout, "No meetings found.")
		return nil
	}
	cli.PrintTable(os.Stdout, headers, rows)
	return nil
}

// hasMeetingLabel checks if an issue has the meeting label attached.
func hasMeetingLabel(issue map[string]any, labelID string) bool {
	labelsRaw, _ := issue["labels"].([]any)
	for _, raw := range labelsRaw {
		l, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if strVal(l, "id") == labelID || strVal(l, "name") == meetingLabelName {
			return true
		}
	}
	return false
}

func runMeetingStatus(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	issueRef, err := resolveIssueRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve issue: %w", err)
	}

	var issue map[string]any
	if err := client.GetJSON(ctx, "/api/issues/"+issueRef.ID, &issue); err != nil {
		return fmt.Errorf("get issue: %w", err)
	}

	desc := strVal(issue, "description")
	stages := parseStages(desc)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, map[string]any{
			"issue_key": issueDisplayKey(issue),
			"title":     strVal(issue, "title"),
			"status":    strVal(issue, "status"),
			"stages":    stages,
		})
	}

	issueKey := issueDisplayKey(issue)
	fmt.Fprintf(os.Stdout, "Meeting: %s (%s)\n\n", strVal(issue, "title"), issueKey)
	fmt.Fprintf(os.Stdout, "Status: %s\n\n", strVal(issue, "status"))

	if len(stages) == 0 {
		fmt.Fprintln(os.Stdout, "No stages table found in description.")
		return nil
	}

	headers := []string{"STAGE", "STATUS"}
	rows := make([][]string, 0, len(stages))
	completed := 0
	for _, s := range stages {
		statusLabel := s.Status
		if s.Status == stageComplete {
			statusLabel = "✓ Done"
			completed++
		} else {
			statusLabel = "☐ Pending"
		}
		rows = append(rows, []string{s.Name, statusLabel})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	fmt.Fprintf(os.Stdout, "\nProgress: %d/%d stages complete\n", completed, len(stages))
	return nil
}

func runMeetingAdvance(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	issueRef, err := resolveIssueRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve issue: %w", err)
	}

	var issue map[string]any
	if err := client.GetJSON(ctx, "/api/issues/"+issueRef.ID, &issue); err != nil {
		return fmt.Errorf("get issue: %w", err)
	}

	desc := strVal(issue, "description")
	newDesc, advanced := advanceStageDescription(desc)
	if !advanced {
		fmt.Fprintln(os.Stdout, "No stages to advance — all stages are already complete or no stages table found.")
		return nil
	}

	// Update the issue description
	body := map[string]any{"description": newDesc}
	var updated map[string]any
	if err := client.PutJSON(ctx, "/api/issues/"+issueRef.ID, body, &updated); err != nil {
		return fmt.Errorf("update meeting: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, map[string]any{
			"issue_id": issueRef.ID,
			"advanced": true,
		})
	}

	fmt.Fprintf(os.Stdout, "Meeting %s advanced to next stage.\n", issueRef.Display)
	// Show current status
	stages := parseStages(newDesc)
	completed := 0
	for _, s := range stages {
		if s.Status == stageComplete {
			completed++
		} else {
			fmt.Fprintf(os.Stdout, "Current stage: %s\n", s.Name)
			break
		}
	}
	fmt.Fprintf(os.Stdout, "Progress: %d/%d stages complete\n", completed, len(stages))
	return nil
}

func runMeetingSummary(cmd *cobra.Command, args []string) error {
	content, hasContent, err := resolveTextFlag(cmd, "content")
	if err != nil {
		return err
	}
	if !hasContent {
		return fmt.Errorf("--content, --content-stdin, or --content-file is required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	issueRef, err := resolveIssueRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve issue: %w", err)
	}

	var issue map[string]any
	if err := client.GetJSON(ctx, "/api/issues/"+issueRef.ID, &issue); err != nil {
		return fmt.Errorf("get issue: %w", err)
	}

	desc := strVal(issue, "description")
	newDesc := appendToSummary(desc, content)

	body := map[string]any{"description": newDesc}
	var updated map[string]any
	if err := client.PutJSON(ctx, "/api/issues/"+issueRef.ID, body, &updated); err != nil {
		return fmt.Errorf("update meeting: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, map[string]any{
			"issue_id": issueRef.ID,
			"updated":  true,
		})
	}

	fmt.Fprintf(os.Stdout, "Summary appended to meeting %s.\n", issueRef.Display)
	return nil
}

func runMeetingClose(cmd *cobra.Command, args []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	issueRef, err := resolveIssueRef(ctx, client, args[0])
	if err != nil {
		return fmt.Errorf("resolve issue: %w", err)
	}

	body := map[string]any{"status": "done"}
	var updated map[string]any
	if err := client.PutJSON(ctx, "/api/issues/"+issueRef.ID, body, &updated); err != nil {
		return fmt.Errorf("close meeting: %w", err)
	}

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, map[string]any{
			"issue_id": issueRef.ID,
			"status":   "done",
		})
	}

	fmt.Fprintf(os.Stdout, "Meeting %s closed.\n", issueRef.Display)
	return nil
}
