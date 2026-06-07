package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/aicortex/aicortex/server/internal/tunnel"
	"github.com/aicortex/aicortex/server/pkg/protocol"
	db "github.com/aicortex/aicortex/server/pkg/db/generated"
)

type runtimeTunnelResponse struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	RuntimeID   string `json:"runtime_id"`
	Port        int    `json:"port"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
	PreviewURL  string `json:"preview_url,omitempty"`
}

func runtimeTunnelPreviewPath(runtimeID string, port int, workspaceSlug string) string {
	params := url.Values{}
	params.Set("workspace_slug", workspaceSlug)
	return fmt.Sprintf("/api/runtimes/%s/tunnel/%d/?%s", runtimeID, port, params.Encode())
}

func (h *Handler) runtimeTunnelEnabled(w http.ResponseWriter) bool {
	if !tunnel.FeatureRuntimeTunnel() {
		writeError(w, http.StatusNotFound, "not found")
		return false
	}
	return true
}

func (h *Handler) authorizeRuntimeTunnelUse(w http.ResponseWriter, r *http.Request, runtimeID string) (db.Member, db.AgentRuntime, bool) {
	runtimeUUID, valid := parseUUIDOrBadRequest(w, runtimeID, "runtime_id")
	if !valid {
		return db.Member{}, db.AgentRuntime{}, false
	}
	rt, err := h.Queries.GetAgentRuntime(r.Context(), runtimeUUID)
	if err != nil {
		writeError(w, http.StatusNotFound, "runtime not found")
		return db.Member{}, db.AgentRuntime{}, false
	}
	member, memberOK := h.requireWorkspaceMember(w, r, uuidToString(rt.WorkspaceID), "runtime not found")
	if !memberOK {
		return db.Member{}, db.AgentRuntime{}, false
	}
	if !canUseRuntimeForAgent(member, rt) {
		writeError(w, http.StatusForbidden, "you do not have access to this runtime")
		return db.Member{}, db.AgentRuntime{}, false
	}
	return member, rt, true
}

func scanRuntimeTunnel(row interface {
	Scan(dest ...any) error
}) (runtimeTunnelResponse, error) {
	var item runtimeTunnelResponse
	var id, wsID, rtID pgtype.UUID
	var createdAt pgtype.Timestamptz
	if err := row.Scan(&id, &wsID, &rtID, &item.Port, &item.Title, &item.Status, &createdAt); err != nil {
		return runtimeTunnelResponse{}, err
	}
	item.ID = uuidToString(id)
	item.WorkspaceID = uuidToString(wsID)
	item.RuntimeID = uuidToString(rtID)
	item.CreatedAt = timestampToString(createdAt)
	return item, nil
}

func (h *Handler) attachRuntimeTunnelPreviewURLs(ctx context.Context, wsID pgtype.UUID, items []runtimeTunnelResponse) []runtimeTunnelResponse {
	ws, err := h.Queries.GetWorkspace(ctx, wsID)
	if err != nil {
		return items
	}
	slug := ws.Slug
	for i := range items {
		items[i].PreviewURL = runtimeTunnelPreviewPath(items[i].RuntimeID, items[i].Port, slug)
	}
	return items
}

// ListRuntimeTunnels returns registered preview tunnels for a runtime.
func (h *Handler) ListRuntimeTunnels(w http.ResponseWriter, r *http.Request) {
	if !h.runtimeTunnelEnabled(w) {
		return
	}
	runtimeID := chi.URLParam(r, "runtimeId")
	_, rt, ok := h.authorizeRuntimeTunnelUse(w, r, runtimeID)
	if !ok {
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, workspace_id, runtime_id, port, title, status, created_at
		 FROM runtime_tunnel
		 WHERE runtime_id = $1
		 ORDER BY created_at DESC`,
		rt.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list tunnels")
		return
	}
	defer rows.Close()

	items := []runtimeTunnelResponse{}
	for rows.Next() {
		item, err := scanRuntimeTunnel(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read tunnel")
			return
		}
		items = append(items, item)
	}
	items = h.attachRuntimeTunnelPreviewURLs(r.Context(), rt.WorkspaceID, items)
	writeJSON(w, http.StatusOK, items)
}

// CreateRuntimeTunnel registers a loopback port for iframe preview.
func (h *Handler) CreateRuntimeTunnel(w http.ResponseWriter, r *http.Request) {
	if !h.runtimeTunnelEnabled(w) {
		return
	}
	runtimeID := chi.URLParam(r, "runtimeId")
	member, rt, ok := h.authorizeRuntimeTunnelUse(w, r, runtimeID)
	if !ok {
		return
	}
	if !canEditRuntime(member, rt) {
		writeError(w, http.StatusForbidden, "you can only manage tunnels on runtimes you own")
		return
	}

	var req struct {
		Port  int    `json:"port"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := tunnel.ValidatePort(req.Port); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if h.DaemonHub == nil || h.TunnelPending == nil {
		writeError(w, http.StatusServiceUnavailable, "daemon relay unavailable")
		return
	}
	if h.DaemonHub.RuntimeConnectionCount(uuidToString(rt.ID)) == 0 {
		writeError(w, http.StatusServiceUnavailable, "daemon websocket not connected for this runtime")
		return
	}
	probe, err := h.relayTunnelHTTP(
		r.Context(),
		rt,
		req.Port,
		http.MethodHead,
		"/",
		nil,
		nil,
		time.Duration(tunnel.ProbeTimeout)*time.Second,
	)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	if probe.Error != "" {
		writeError(w, http.StatusBadGateway, "port is not reachable on this runtime")
		return
	}

	var count int
	if err := h.DB.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM runtime_tunnel WHERE runtime_id = $1 AND status = 'active'`,
		rt.ID,
	).Scan(&count); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to count tunnels")
		return
	}
	if count >= tunnel.MaxTunnelsPerRT {
		writeError(w, http.StatusBadRequest, "maximum tunnels reached for this runtime")
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = fmt.Sprintf("Port %d", req.Port)
	}

	tunnelID := uuid.New().String()
	row := h.DB.QueryRow(r.Context(),
		`INSERT INTO runtime_tunnel (id, workspace_id, runtime_id, port, title, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, workspace_id, runtime_id, port, title, status, created_at`,
		tunnelID, rt.WorkspaceID, rt.ID, req.Port, title, member.UserID,
	)
	item, err := scanRuntimeTunnel(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "a tunnel for this port already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create tunnel")
		return
	}
	items := h.attachRuntimeTunnelPreviewURLs(r.Context(), rt.WorkspaceID, []runtimeTunnelResponse{item})
	writeJSON(w, http.StatusCreated, items[0])
}

// DeleteRuntimeTunnel removes a registered preview tunnel.
func (h *Handler) DeleteRuntimeTunnel(w http.ResponseWriter, r *http.Request) {
	if !h.runtimeTunnelEnabled(w) {
		return
	}
	runtimeID := chi.URLParam(r, "runtimeId")
	tunnelID := chi.URLParam(r, "tunnelId")
	member, rt, ok := h.authorizeRuntimeTunnelUse(w, r, runtimeID)
	if !ok {
		return
	}
	if !canEditRuntime(member, rt) {
		writeError(w, http.StatusForbidden, "you can only manage tunnels on runtimes you own")
		return
	}

	tag, err := h.DB.Exec(r.Context(),
		`DELETE FROM runtime_tunnel WHERE id = $1 AND runtime_id = $2`,
		tunnelID, rt.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete tunnel")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "tunnel not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func prepareTunnelEmbedResponse(w http.ResponseWriter) {
	// Global API CSP sets frame-ancestors 'none', which renders the preview
	// iframe blank even when the proxied page loads fine in a new tab.
	w.Header().Del("Content-Security-Policy")
}

func writeTunnelError(w http.ResponseWriter, status int, msg string) {
	prepareTunnelEmbedResponse(w)
	writeError(w, status, msg)
}

// ProxyRuntimeTunnel forwards an HTTP request to the daemon's loopback port.
func (h *Handler) ProxyRuntimeTunnel(w http.ResponseWriter, r *http.Request) {
	if !h.runtimeTunnelEnabled(w) {
		return
	}
	runtimeID := chi.URLParam(r, "runtimeId")
	portStr := chi.URLParam(r, "port")
	_, rt, ok := h.authorizeRuntimeTunnelUse(w, r, runtimeID)
	if !ok {
		return
	}

	var port int
	if _, err := fmt.Sscanf(portStr, "%d", &port); err != nil || tunnel.ValidatePort(port) != nil {
		writeTunnelError(w, http.StatusBadRequest, "invalid port")
		return
	}

	var exists bool
	if err := h.DB.QueryRow(r.Context(),
		`SELECT EXISTS(
			SELECT 1 FROM runtime_tunnel
			WHERE runtime_id = $1 AND port = $2 AND status = 'active'
		)`,
		rt.ID, port,
	).Scan(&exists); err != nil || !exists {
		writeTunnelError(w, http.StatusNotFound, "tunnel not found")
		return
	}

	if h.DaemonHub == nil || h.TunnelPending == nil {
		writeTunnelError(w, http.StatusServiceUnavailable, "daemon relay unavailable")
		return
	}
	if h.DaemonHub.RuntimeConnectionCount(uuidToString(rt.ID)) == 0 {
		writeTunnelError(w, http.StatusServiceUnavailable, "daemon websocket not connected for this runtime")
		return
	}
	limitKey := fmt.Sprintf("%s:%d", uuidToString(rt.ID), port)
	if h.TunnelLimiter != nil && !h.TunnelLimiter.Allow(limitKey, tunnel.ProxyRateLimit, time.Minute) {
		writeTunnelError(w, http.StatusTooManyRequests, "tunnel rate limit exceeded")
		return
	}

	subPath := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	proxyPath := "/"
	if subPath != "" {
		proxyPath = "/" + subPath
	}
	if upstreamQuery := tunnelUpstreamQuery(r.URL.Query()); upstreamQuery != "" {
		proxyPath += "?" + upstreamQuery
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, tunnel.MaxBodyBytes+1))
	if err != nil {
		writeTunnelError(w, http.StatusBadRequest, "failed to read request body")
		return
	}
	if len(body) > tunnel.MaxBodyBytes {
		writeTunnelError(w, http.StatusRequestEntityTooLarge, "request body too large")
		return
	}

	headers := map[string]string{}
	for key, values := range r.Header {
		if len(values) == 0 || isTunnelHopHeader(key) {
			continue
		}
		headers[key] = values[0]
	}

	timeout := time.Duration(tunnel.ProxyTimeout) * time.Second
	resp, err := h.relayTunnelHTTP(r.Context(), rt, port, r.Method, proxyPath, headers, body, timeout)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			writeTunnelError(w, http.StatusRequestTimeout, "request cancelled")
			return
		}
		writeTunnelError(w, http.StatusGatewayTimeout, err.Error())
		return
	}
	if resp.Error != "" {
		writeTunnelError(w, http.StatusBadGateway, resp.Error)
		return
	}
	prepareTunnelEmbedResponse(w)
	for key, values := range resp.Headers {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	if resp.Status <= 0 {
		resp.Status = http.StatusBadGateway
	}
	w.WriteHeader(resp.Status)
	if len(resp.Body) > 0 {
		_, _ = w.Write(resp.Body)
	}
	go h.touchRuntimeTunnelActivity(rt.ID, port)
}

func (h *Handler) touchRuntimeTunnelActivity(runtimeID pgtype.UUID, port int) {
	if h.DB == nil {
		return
	}
	_, _ = h.DB.Exec(context.Background(),
		`UPDATE runtime_tunnel SET updated_at = now()
		 WHERE runtime_id = $1 AND port = $2 AND status = 'active'`,
		runtimeID, port,
	)
}

func (h *Handler) relayTunnelHTTP(
	ctx context.Context,
	rt db.AgentRuntime,
	port int,
	method, path string,
	headers map[string]string,
	body []byte,
	timeout time.Duration,
) (tunnel.ProxyResponse, error) {
	if h.DaemonHub == nil || h.TunnelPending == nil {
		return tunnel.ProxyResponse{}, fmt.Errorf("daemon relay unavailable")
	}
	if h.DaemonHub.RuntimeConnectionCount(uuidToString(rt.ID)) == 0 {
		return tunnel.ProxyResponse{}, fmt.Errorf("daemon websocket not connected for this runtime")
	}

	requestID := uuid.New().String()
	ch, cancel := h.TunnelPending.Register(requestID, timeout)
	defer cancel()

	payload := protocol.TunnelRequestPayload{
		RequestID: requestID,
		RuntimeID: uuidToString(rt.ID),
		Port:      port,
		Method:    method,
		Path:      path,
		Headers:   headers,
	}
	if len(body) > 0 {
		payload.Body = base64.StdEncoding.EncodeToString(body)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return tunnel.ProxyResponse{}, fmt.Errorf("failed to encode tunnel request")
	}
	h.DaemonHub.SendToRuntime(uuidToString(rt.ID), protocol.Message{
		Type:    protocol.EventTunnelRequest,
		Payload: raw,
	})

	select {
	case resp := <-ch:
		return resp, nil
	case <-time.After(timeout):
		return tunnel.ProxyResponse{}, fmt.Errorf("daemon did not respond")
	case <-ctx.Done():
		return tunnel.ProxyResponse{}, ctx.Err()
	}
}

func tunnelUpstreamQuery(values url.Values) string {
	if len(values) == 0 {
		return ""
	}
	filtered := url.Values{}
	for key, vals := range values {
		switch strings.ToLower(key) {
		case "workspace_slug", "workspace_id":
			continue
		default:
			filtered[key] = vals
		}
	}
	return filtered.Encode()
}

func isTunnelHopHeader(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
		"te", "trailers", "transfer-encoding", "upgrade", "host", "cookie",
		"authorization", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto":
		return true
	default:
		return false
	}
}

// HandleTunnelResponse completes a pending proxy request when the daemon answers.
func (h *Handler) HandleTunnelResponse(msg protocol.Message) {
	if h.TunnelPending == nil {
		return
	}
	var payload protocol.TunnelResponsePayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil || payload.RequestID == "" {
		return
	}
	resp := tunnel.ProxyResponse{Status: payload.Status, Headers: payload.Headers, Error: payload.Error}
	if payload.Body != "" {
		body, err := base64.StdEncoding.DecodeString(payload.Body)
		if err != nil {
			resp.Error = "invalid response body encoding"
		} else {
			resp.Body = body
		}
	}
	h.TunnelPending.Complete(payload.RequestID, resp)
}
