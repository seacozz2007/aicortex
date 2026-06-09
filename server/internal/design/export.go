package design

import (
	"archive/zip"
	"bytes"
	"fmt"
	"path"
	"strings"
)

const printStyles = `<style id="aicortex-print-export">
@media print {
  html, body { margin: 0; padding: 0; }
  section, .slide, [data-slide] { page-break-after: always; break-after: page; }
  section:last-child, .slide:last-child, [data-slide]:last-child { page-break-after: auto; break-after: auto; }
}
</style>`

// BuildZipArchive packs relative-path → content into a zip blob.
func BuildZipArchive(files map[string][]byte) ([]byte, error) {
	if len(files) == 0 {
		return nil, fmt.Errorf("no files to export")
	}
	buf := &bytes.Buffer{}
	w := zip.NewWriter(buf)
	for name, body := range files {
		name = strings.TrimPrefix(path.Clean("/"+name), "/")
		if name == "" || name == "." {
			continue
		}
		fw, err := w.Create(name)
		if err != nil {
			return nil, err
		}
		if _, err := fw.Write(body); err != nil {
			return nil, err
		}
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// PreparePrintHTML injects print-friendly CSS for browser Print-to-PDF export.
func PreparePrintHTML(html []byte) []byte {
	text := string(html)
	lower := strings.ToLower(text)
	if strings.Contains(lower, "aicortex-print-export") {
		return html
	}
	if idx := strings.Index(lower, "</head>"); idx >= 0 {
		return []byte(text[:idx] + printStyles + text[idx:])
	}
	if idx := strings.Index(lower, "<body"); idx >= 0 {
		return []byte(printStyles + text)
	}
	return append([]byte(printStyles), html...)
}

// BuildMinimalPPTX returns a valid single-slide PPTX pointing users to the HTML deck.
func BuildMinimalPPTX(title, htmlFileName string) ([]byte, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Design Export"
	}
	htmlFileName = strings.TrimSpace(htmlFileName)
	if htmlFileName == "" {
		htmlFileName = "index.html"
	}
	slideText := fmt.Sprintf("%s — open %s in a browser for the full HTML deck.", title, htmlFileName)

	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`

	rels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

	presRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`

	presentation := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`

	escaped := xmlEscape(slideText)
	slide := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr/><p:txBody>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:t>%s</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`, escaped)

	buf := &bytes.Buffer{}
	w := zip.NewWriter(buf)
	files := map[string]string{
		"[Content_Types].xml":              contentTypes,
		"_rels/.rels":                      rels,
		"ppt/presentation.xml":             presentation,
		"ppt/_rels/presentation.xml.rels":  presRels,
		"ppt/slides/slide1.xml":            slide,
	}
	for name, body := range files {
		fw, err := w.Create(name)
		if err != nil {
			return nil, err
		}
		if _, err := fw.Write([]byte(body)); err != nil {
			return nil, err
		}
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}
