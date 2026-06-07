package tunnel

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/aicortex/aicortex/server/internal/tunnel"
	"github.com/aicortex/aicortex/server/pkg/protocol"
)

const loopbackHost = "127.0.0.1"

var hopByHopHeaders = map[string]struct{}{
	"connection":          {},
	"keep-alive":          {},
	"proxy-authenticate":  {},
	"proxy-authorization": {},
	"te":                  {},
	"trailers":            {},
	"transfer-encoding":   {},
	"upgrade":             {},
}

// Proxy executes loopback HTTP requests on behalf of the control plane.
type Proxy struct {
	logger  *slog.Logger
	sendMsg func(protocol.Message)
	client  *http.Client
}

func NewProxy(logger *slog.Logger) *Proxy {
	return &Proxy{
		logger: logger,
		client: &http.Client{
			Timeout: time.Duration(tunnel.ProxyTimeout) * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func (p *Proxy) SetSendFunc(fn func(protocol.Message)) {
	p.sendMsg = fn
}

func (p *Proxy) HandleRequest(payload protocol.TunnelRequestPayload) {
	go p.handleRequest(payload)
}

func (p *Proxy) handleRequest(payload protocol.TunnelRequestPayload) {
	resp := protocol.TunnelResponsePayload{RequestID: payload.RequestID}

	if err := tunnel.ValidatePort(payload.Port); err != nil {
		resp.Error = err.Error()
		p.send(resp)
		return
	}

	method := strings.ToUpper(strings.TrimSpace(payload.Method))
	if method == "" {
		method = http.MethodGet
	}

	path := payload.Path
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	target := fmt.Sprintf("http://%s:%d%s", loopbackHost, payload.Port, path)
	req, err := http.NewRequest(method, target, nil)
	if err != nil {
		resp.Error = err.Error()
		p.send(resp)
		return
	}

	var body []byte
	if payload.Body != "" {
		body, err = base64.StdEncoding.DecodeString(payload.Body)
		if err != nil {
			resp.Error = "invalid request body encoding"
			p.send(resp)
			return
		}
		if len(body) > tunnel.MaxBodyBytes {
			resp.Error = "request body too large"
			p.send(resp)
			return
		}
		if len(body) > 0 {
			req.Body = io.NopCloser(bytes.NewReader(body))
			req.ContentLength = int64(len(body))
		}
	}

	for key, value := range payload.Headers {
		if isHopByHopHeader(key) {
			continue
		}
		req.Header.Set(key, value)
	}
	req.Host = net.JoinHostPort(loopbackHost, fmt.Sprintf("%d", payload.Port))

	httpResp, err := p.client.Do(req)
	if err != nil {
		resp.Error = err.Error()
		p.send(resp)
		return
	}
	defer httpResp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(httpResp.Body, tunnel.MaxBodyBytes+1))
	if err != nil {
		resp.Error = err.Error()
		p.send(resp)
		return
	}
	if len(respBody) > tunnel.MaxBodyBytes {
		resp.Error = "response body too large"
		p.send(resp)
		return
	}

	resp.Status = httpResp.StatusCode
	resp.Headers = sanitizeResponseHeaders(httpResp.Header)
	if len(respBody) > 0 {
		resp.Body = base64.StdEncoding.EncodeToString(respBody)
	}
	p.send(resp)
}

func (p *Proxy) send(resp protocol.TunnelResponsePayload) {
	if p.sendMsg == nil {
		return
	}
	raw, err := json.Marshal(resp)
	if err != nil {
		p.logger.Debug("tunnel proxy: marshal response failed", "error", err)
		return
	}
	p.sendMsg(protocol.Message{Type: protocol.EventTunnelResponse, Payload: raw})
}

func isHopByHopHeader(name string) bool {
	_, ok := hopByHopHeaders[strings.ToLower(strings.TrimSpace(name))]
	return ok
}

func sanitizeResponseHeaders(h http.Header) map[string][]string {
	out := make(map[string][]string, len(h))
	for key, values := range h {
		if isHopByHopHeader(key) {
			continue
		}
		lower := strings.ToLower(key)
		if lower == "content-security-policy" || lower == "x-frame-options" {
			continue
		}
		cp := make([]string, len(values))
		copy(cp, values)
		out[key] = cp
	}
	return out
}
