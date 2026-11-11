// ============================================================
// DownloadForge Companion — messaging.go
// ObsidianLabs | p4inz
//
// Chrome Native Messaging Protocol implementation.
// Messages are framed with a 4-byte little-endian length prefix.
// ============================================================

package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
)

// ── Message types ─────────────────────────────────────────────

type IncomingMessage struct {
	Type    string          `json:"type"`
	ID      interface{}     `json:"id"`
	Payload json.RawMessage `json:"payload"`
}

type OutgoingMessage struct {
	Type    string      `json:"type"`
	ID      interface{} `json:"id,omitempty"`
	Payload interface{} `json:"payload,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type DownloadPayload struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Category string `json:"category"`
	SavePath string `json:"savePath"`
}

// ── Messenger ─────────────────────────────────────────────────

type Messenger struct {
	queue  *Queue
	stdin  io.Reader
	stdout io.Writer
}

func NewMessenger(q *Queue) *Messenger {
	return &Messenger{
		queue:  q,
		stdin:  os.Stdin,
		stdout: os.Stdout,
	}
}

// Run reads messages from stdin in a loop until EOF or error.
func (m *Messenger) Run() error {
	log.Println("Native messaging loop started")
	for {
		msg, err := m.readMessage()
		if err != nil {
			if err == io.EOF {
				log.Println("Extension disconnected (EOF)")
				return nil
			}
			return fmt.Errorf("read error: %w", err)
		}

		m.handleMessage(msg)
	}
}

// readMessage reads one native message from stdin.
func (m *Messenger) readMessage() (*IncomingMessage, error) {
	// Read 4-byte length prefix
	var length uint32
	if err := binary.Read(m.stdin, binary.LittleEndian, &length); err != nil {
		return nil, err
	}

	if length == 0 || length > 1024*1024 { // max 1MB message
		return nil, fmt.Errorf("invalid message length: %d", length)
	}

	// Read message body
	buf := make([]byte, length)
	if _, err := io.ReadFull(m.stdin, buf); err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var msg IncomingMessage
	if err := json.Unmarshal(buf, &msg); err != nil {
		return nil, fmt.Errorf("json parse: %w", err)
	}

	log.Printf("Received message: type=%s id=%v", msg.Type, msg.ID)
	return &msg, nil
}

// sendMessage writes one native message to stdout.
func (m *Messenger) sendMessage(msg OutgoingMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	length := uint32(len(data))
	if err := binary.Write(m.stdout, binary.LittleEndian, length); err != nil {
		return fmt.Errorf("write length: %w", err)
	}
	if _, err := m.stdout.Write(data); err != nil {
		return fmt.Errorf("write body: %w", err)
	}

	return nil
}

// handleMessage routes an incoming message to the right handler.
func (m *Messenger) handleMessage(msg *IncomingMessage) {
	switch msg.Type {

	case "PING":
		m.sendMessage(OutgoingMessage{
			Type: "PONG",
			ID:   msg.ID,
			Payload: map[string]string{
				"version": Version,
				"company": "ObsidianLabs",
			},
		})

	case "DOWNLOAD":
		var payload DownloadPayload
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			log.Printf("Bad DOWNLOAD payload: %v", err)
			m.sendMessage(OutgoingMessage{Type: "ERROR", ID: msg.ID, Error: "invalid payload"})
			return
		}

		taskID, err := m.queue.AddTask(DownloadTask{
			URL:      payload.URL,
			Filename: payload.Filename,
			Category: payload.Category,
			SavePath: payload.SavePath,
		})

		if err != nil {
			m.sendMessage(OutgoingMessage{Type: "ERROR", ID: msg.ID, Error: err.Error()})
			return
		}

		m.sendMessage(OutgoingMessage{
			Type: "DOWNLOAD_ACK",
			ID:   msg.ID,
			Payload: map[string]interface{}{
				"taskId": taskID,
				"status": "queued",
			},
		})

	case "QUEUE_STATUS":
		status := m.queue.GetStatus()
		m.sendMessage(OutgoingMessage{Type: "QUEUE_STATUS", ID: msg.ID, Payload: status})

	case "PAUSE":
		var p struct{ TaskID string `json:"taskId"` }
		json.Unmarshal(msg.Payload, &p)
		m.queue.PauseTask(p.TaskID)
		m.sendMessage(OutgoingMessage{Type: "ACK", ID: msg.ID})

	case "RESUME":
		var p struct{ TaskID string `json:"taskId"` }
		json.Unmarshal(msg.Payload, &p)
		m.queue.ResumeTask(p.TaskID)
		m.sendMessage(OutgoingMessage{Type: "ACK", ID: msg.ID})

	case "CANCEL":
		var p struct{ TaskID string `json:"taskId"` }
		json.Unmarshal(msg.Payload, &p)
		m.queue.CancelTask(p.TaskID)
		m.sendMessage(OutgoingMessage{Type: "ACK", ID: msg.ID})

	default:
		log.Printf("Unknown message type: %s", msg.Type)
		m.sendMessage(OutgoingMessage{Type: "ERROR", ID: msg.ID, Error: fmt.Sprintf("unknown type: %s", msg.Type)})
	}
}
