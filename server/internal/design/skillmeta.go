package design

import (
	"encoding/json"
	"regexp"
	"strings"
)

// DesignParameter describes one OD-style tunable exposed in the composer UI.
type DesignParameter struct {
	ID      string  `json:"id"`
	Label   string  `json:"label"`
	Min     float64 `json:"min"`
	Max     float64 `json:"max"`
	Default float64 `json:"default"`
	Step    float64 `json:"step,omitempty"`
}

type odMeta struct {
	Craft struct {
		Requires []string `json:"requires"`
	} `json:"craft"`
	Parameters []DesignParameter `json:"parameters"`
}

// ParseOpenDesignMetadata reads od.* fields from skill config JSON and/or YAML frontmatter.
func ParseOpenDesignMetadata(configJSON []byte, content string) (craftRequires []string, parameters []DesignParameter) {
	var meta odMeta
	if len(configJSON) > 0 {
		var root map[string]json.RawMessage
		if json.Unmarshal(configJSON, &root) == nil {
			if raw, ok := root["od"]; ok {
				_ = json.Unmarshal(raw, &meta)
			}
		}
	}
	if len(meta.Craft.Requires) == 0 && len(meta.Parameters) == 0 {
		if fm := parseFrontmatter(content); fm != "" {
			_ = json.Unmarshal([]byte(fm), &meta)
		}
	}
	return meta.Craft.Requires, meta.Parameters
}

var frontmatterRE = regexp.MustCompile(`(?s)^---\s*\n(.*?)\n---`)

func parseFrontmatter(content string) string {
	m := frontmatterRE.FindStringSubmatch(strings.TrimSpace(content))
	if len(m) < 2 {
		return ""
	}
	block := strings.TrimSpace(m[1])
	if strings.HasPrefix(block, "{") {
		return block
	}
	// Minimal YAML → JSON bridge for `od:` blocks in SKILL.md frontmatter.
	if !strings.Contains(block, "od:") {
		return ""
	}
	var b strings.Builder
	b.WriteString("{")
	inOd := false
	for _, line := range strings.Split(block, "\n") {
		line = strings.TrimSpace(line)
		if line == "od:" {
			inOd = true
			b.WriteString(`"od":{`)
			continue
		}
		if !inOd {
			continue
		}
		if strings.HasPrefix(line, "craft:") {
			b.WriteString(`"craft":{`)
			continue
		}
		if strings.HasPrefix(line, "requires:") {
			items := parseYAMLStringList(line[len("requires:"):])
			raw, _ := json.Marshal(items)
			b.WriteString(`"requires":`)
			b.Write(raw)
			b.WriteString("}")
			continue
		}
		if strings.HasPrefix(line, "parameters:") {
			break
		}
	}
	b.WriteString("}}")
	return b.String()
}

func parseYAMLStringList(rest string) []string {
	rest = strings.TrimSpace(rest)
	if !strings.HasPrefix(rest, "[") {
		return nil
	}
	rest = strings.TrimPrefix(rest, "[")
	rest = strings.TrimSuffix(rest, "]")
	parts := strings.Split(rest, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		p = strings.Trim(p, `"'`)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
