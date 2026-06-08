package design

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type exampleBundle struct {
	Src  string `json:"src"`
	Dest string `json:"dest"`
}

// ResolvedExampleBundle is a server-resolved copy instruction for the daemon.
type ResolvedExampleBundle struct {
	Src  string `json:"src"`
	Dest string `json:"dest"`
}

type exampleManifestEntry struct {
	Bundles      []exampleBundle `json:"bundles"`
	WorkDirHint  string          `json:"work_dir_hint"`
	BootstrapDeck string         `json:"bootstrap_deck"`
}

type exampleManifest struct {
	Entries map[string]exampleManifestEntry `json:"-"`
}

var skillNameRE = regexp.MustCompile(`(?m)^name:\s*(.+)\s*$`)

const designExampleSeedMarker = ".aicortex/design-example-seeded"

// ParseExampleIDFromSkillConfig reads od.example_id from skill config JSON.
func ParseExampleIDFromSkillConfig(configJSON []byte) string {
	if len(configJSON) == 0 {
		return ""
	}
	var root struct {
		OD struct {
			ExampleID string `json:"example_id"`
		} `json:"od"`
	}
	if json.Unmarshal(configJSON, &root) != nil {
		return ""
	}
	return strings.TrimSpace(root.OD.ExampleID)
}

// EnsureExampleSkill creates or reuses a workspace skill for an OD example card
// and links it to the design agent. Idempotent.
func EnsureExampleSkill(
	ctx context.Context,
	q *db.Queries,
	workspaceID, agentID, createdBy pgtype.UUID,
	exampleID string,
) (pgtype.UUID, string, error) {
	exampleID = strings.TrimSpace(exampleID)
	if exampleID == "" {
		return pgtype.UUID{}, "", nil
	}

	skillMD, skillName, description, err := readExampleSkillMeta(exampleID)
	if err != nil {
		return pgtype.UUID{}, "", err
	}

	configBytes, _ := json.Marshal(map[string]any{
		"od": map[string]any{
			"example_id": exampleID,
		},
	})

	skillID, err := findOrCreateExampleSkill(ctx, q, workspaceID, createdBy, skillName, description, skillMD, configBytes)
	if err != nil {
		return pgtype.UUID{}, "", err
	}

	linked, err := q.ListAgentSkills(ctx, agentID)
	if err != nil {
		return pgtype.UUID{}, "", err
	}
	alreadyLinked := false
	for _, sk := range linked {
		if sk.ID == skillID {
			alreadyLinked = true
			break
		}
	}
	if !alreadyLinked {
		if err := q.AddAgentSkill(ctx, db.AddAgentSkillParams{
			AgentID: agentID,
			SkillID: skillID,
		}); err != nil {
			return pgtype.UUID{}, "", err
		}
	}

	hint, _ := ExampleWorkDirHint(exampleID)
	return skillID, hint, nil
}

func findOrCreateExampleSkill(
	ctx context.Context,
	q *db.Queries,
	workspaceID, createdBy pgtype.UUID,
	name, description, content string,
	config []byte,
) (pgtype.UUID, error) {
	existing, err := q.GetSkillByWorkspaceAndName(ctx, db.GetSkillByWorkspaceAndNameParams{
		WorkspaceID: workspaceID,
		Name:        name,
	})
	if err == nil {
		return existing.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return pgtype.UUID{}, err
	}

	created, err := q.CreateSkill(ctx, db.CreateSkillParams{
		WorkspaceID: workspaceID,
		Name:        name,
		Description: description,
		Content:     content,
		Config:      config,
		CreatedBy:   createdBy,
	})
	if err != nil {
		return pgtype.UUID{}, err
	}
	return created.ID, nil
}

// ExampleWorkDirHint returns prompt guidance after templates are seeded.
func ExampleWorkDirHint(exampleID string) (string, error) {
	entry, err := manifestEntry(exampleID)
	if err == nil && entry.WorkDirHint != "" {
		return entry.WorkDirHint, nil
	}
	skillName, err := exampleSkillName(exampleID)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Bundled example templates are under skills/%s/. Read SKILL.md before authoring.", skillName), nil
}

// SeedExampleWorkDir copies bundled OD example assets into the task work directory.
// Idempotent per example ID (re-seeds when the example changes).
func SeedExampleWorkDir(workDir, exampleID string) error {
	bundles, err := ResolveExampleBundleSources(exampleID)
	if err != nil {
		return err
	}
	return SeedExampleBundles(workDir, exampleID, bundles)
}

// ResolveExampleBundleSources resolves bundled example paths to absolute sources on
// the host running the API server (same machine as the local daemon in dev).
func ResolveExampleBundleSources(exampleID string) ([]ResolvedExampleBundle, error) {
	exampleID = strings.TrimSpace(exampleID)
	if exampleID == "" {
		return nil, nil
	}
	raw, err := resolveExampleBundles(exampleID)
	if err != nil {
		return nil, err
	}
	out := make([]ResolvedExampleBundle, 0, len(raw))
	for _, b := range raw {
		src := resolveBundleSource(b.Src, exampleID)
		if src == "" {
			return nil, fmt.Errorf("design example %q: bundle source %q not found (set AICORTEX_DESIGN_RESOURCES or OPEN_DESIGN_ROOT)", exampleID, b.Src)
		}
		srcAbs, err := filepath.Abs(src)
		if err != nil {
			return nil, err
		}
		out = append(out, ResolvedExampleBundle{Src: srcAbs, Dest: b.Dest})
	}
	return out, nil
}

// SeedExampleBundles copies pre-resolved bundle sources into workDir.
func SeedExampleBundles(workDir, exampleID string, bundles []ResolvedExampleBundle) error {
	exampleID = strings.TrimSpace(exampleID)
	if exampleID == "" || strings.TrimSpace(workDir) == "" {
		return nil
	}

	markerPath := filepath.Join(workDir, designExampleSeedMarker)
	if data, err := os.ReadFile(markerPath); err == nil && strings.TrimSpace(string(data)) == exampleID {
		return nil
	}

	for _, b := range bundles {
		dest := filepath.Join(workDir, filepath.FromSlash(b.Dest))
		if err := copyDir(b.Src, dest); err != nil {
			return fmt.Errorf("design example %q: copy %q → %q: %w", exampleID, b.Src, dest, err)
		}
	}

	if entry, err := manifestEntry(exampleID); err == nil && strings.TrimSpace(entry.BootstrapDeck) != "" {
		if err := bootstrapHtmlPptDeck(workDir, entry.BootstrapDeck); err != nil {
			return fmt.Errorf("design example %q: bootstrap deck: %w", exampleID, err)
		}
	}

	if err := os.MkdirAll(filepath.Dir(markerPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(markerPath, []byte(exampleID), 0o644)
}

// bootstrapHtmlPptDeck copies a full-deck template plus shared assets into the
// work_dir root so index.html works immediately (runtime.js, themes, one-slide view).
func bootstrapHtmlPptDeck(workDir, templateRel string) error {
	templateRel = strings.TrimSpace(strings.TrimPrefix(templateRel, "/"))
	if templateRel == "" {
		return nil
	}
	templateDir := filepath.Join(workDir, filepath.FromSlash(templateRel))
	if !dirExists(templateDir) {
		return fmt.Errorf("template dir %q not found under work dir", templateRel)
	}

	skillsAssets := filepath.Join(workDir, "skills", "html-ppt", "assets")
	projectAssets := filepath.Join(workDir, "assets")
	if dirExists(skillsAssets) {
		if err := copyDir(skillsAssets, projectAssets); err != nil {
			return fmt.Errorf("copy html-ppt assets: %w", err)
		}
	}

	indexSrc := filepath.Join(templateDir, "index.html")
	indexData, err := os.ReadFile(indexSrc)
	if err != nil {
		return fmt.Errorf("read template index.html: %w", err)
	}
	indexHTML := strings.ReplaceAll(string(indexData), "../../../assets/", "assets/")
	if err := os.WriteFile(filepath.Join(workDir, "index.html"), []byte(indexHTML), 0o644); err != nil {
		return err
	}

	styleSrc := filepath.Join(templateDir, "style.css")
	if data, err := os.ReadFile(styleSrc); err == nil {
		if err := os.WriteFile(filepath.Join(workDir, "style.css"), data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func resolveExampleBundles(exampleID string) ([]exampleBundle, error) {
	entry, err := manifestEntry(exampleID)
	if err == nil && len(entry.Bundles) > 0 {
		return entry.Bundles, nil
	}

	skillName, err := exampleSkillName(exampleID)
	if err != nil {
		return nil, err
	}
	return []exampleBundle{{
		Src:  "examples/" + exampleID,
		Dest: "skills/" + skillName,
	}}, nil
}

func manifestEntry(exampleID string) (exampleManifestEntry, error) {
	data, err := os.ReadFile(filepath.Join(designResourcesRoot(), "manifest.json"))
	if err != nil {
		return exampleManifestEntry{}, err
	}
	var raw map[string]exampleManifestEntry
	if err := json.Unmarshal(data, &raw); err != nil {
		return exampleManifestEntry{}, err
	}
	entry, ok := raw[exampleID]
	if !ok {
		return exampleManifestEntry{}, fmt.Errorf("example %q not in manifest", exampleID)
	}
	return entry, nil
}

func readExampleSkillMeta(exampleID string) (content, name, description string, err error) {
	src := exampleSourceDir(exampleID)
	if src == "" {
		return "", "", "", fmt.Errorf("design example %q not found in bundled resources", exampleID)
	}
	skillPath := filepath.Join(src, "SKILL.md")
	data, err := os.ReadFile(skillPath)
	if err != nil {
		return "", "", "", fmt.Errorf("read example SKILL.md: %w", err)
	}
	content = strings.TrimSpace(string(data))
	name, err = exampleSkillName(exampleID)
	if err != nil {
		return "", "", "", err
	}
	description = parseSkillDescription(content)
	if description == "" {
		description = fmt.Sprintf("Open Design example: %s", exampleID)
	}
	return content, name, description, nil
}

func exampleSkillName(exampleID string) (string, error) {
	src := exampleSourceDir(exampleID)
	if src == "" {
		return "", fmt.Errorf("design example %q not found", exampleID)
	}
	data, err := os.ReadFile(filepath.Join(src, "SKILL.md"))
	if err != nil {
		return "", err
	}
	m := skillNameRE.FindStringSubmatch(string(data))
	if len(m) < 2 {
		return exampleID, nil
	}
	return strings.TrimSpace(strings.Trim(m[1], `"'`)), nil
}

func parseSkillDescription(content string) string {
	fm := parseFrontmatter(content)
	if fm == "" {
		return ""
	}
	for _, line := range strings.Split(fm, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "description:") {
			val := strings.TrimSpace(strings.TrimPrefix(line, "description:"))
			val = strings.Trim(val, `"'`)
			if val != "" {
				return val
			}
		}
	}
	return ""
}

func designResourcesRoot() string {
	if v := strings.TrimSpace(os.Getenv("AICORTEX_DESIGN_RESOURCES")); v != "" {
		return v
	}
	for _, rel := range []string{"resources/design", "server/resources/design"} {
		if p := findPathUp(rel); p != "" {
			return p
		}
	}
	if exe, err := os.Executable(); err == nil {
		for _, rel := range []string{
			"resources/design",
			"../resources/design",
			"../../server/resources/design",
		} {
			p := filepath.Join(filepath.Dir(exe), rel)
			if dirExists(p) {
				return p
			}
		}
	}
	return ""
}

func openDesignRoot() string {
	if v := strings.TrimSpace(os.Getenv("OPEN_DESIGN_ROOT")); v != "" {
		return v
	}
	for _, start := range candidateSearchRoots() {
		dir := start
		for {
			sibling := filepath.Join(dir, "open-design")
			if dirExists(filepath.Join(sibling, "design-templates")) {
				return sibling
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return ""
}

func candidateSearchRoots() []string {
	roots := []string{}
	if wd, err := os.Getwd(); err == nil {
		roots = append(roots, wd)
	}
	if exe, err := os.Executable(); err == nil {
		roots = append(roots, filepath.Dir(exe))
	}
	if repo := findRepoRoot(); repo != "" {
		roots = append(roots, repo, filepath.Dir(repo))
	}
	return roots
}

func exampleSourceDir(exampleID string) string {
	if root := designResourcesRoot(); root != "" {
		p := filepath.Join(root, "examples", exampleID)
		if dirExists(p) {
			return p
		}
	}
	if p := findPathUp(filepath.Join("apps", "web", "public", "design-previews", "examples", exampleID)); p != "" {
		return p
	}
	return ""
}

func resolveBundleSource(src, exampleID string) string {
	src = strings.TrimSpace(src)
	if src == "" {
		return ""
	}
	if root := designResourcesRoot(); root != "" {
		p := filepath.Join(root, filepath.FromSlash(src))
		if dirExists(p) {
			return p
		}
	}
	if strings.HasPrefix(src, "examples/") {
		id := strings.TrimPrefix(src, "examples/")
		if id == "" {
			id = exampleID
		}
		if p := exampleSourceDir(id); p != "" {
			return p
		}
	}
	if strings.HasPrefix(src, "design-templates/") {
		od := openDesignRoot()
		if od != "" {
			p := filepath.Join(od, filepath.FromSlash(src))
			if dirExists(p) {
				return p
			}
		}
	}
	return ""
}

func findRepoRoot() string {
	return findPathUp("go.mod")
}

func findPathUp(rel string) string {
	wd, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		candidate := filepath.Join(wd, rel)
		if dirExists(candidate) || fileExists(candidate) {
			return candidate
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			return ""
		}
		wd = parent
	}
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func copyDir(src, dest string) error {
	src = filepath.Clean(src)
	dest = filepath.Clean(dest)
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dest, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}

func copyFile(src, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
