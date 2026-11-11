// ============================================================
// DownloadForge Companion — queue.go
// ObsidianLabs | p4inz
// ============================================================

package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

type TaskStatus string

const (
	StatusQueued     TaskStatus = "queued"
	StatusDownloading TaskStatus = "downloading"
	StatusPaused     TaskStatus = "paused"
	StatusComplete   TaskStatus = "complete"
	StatusFailed     TaskStatus = "failed"
	StatusCancelled  TaskStatus = "cancelled"
)

type DownloadTask struct {
	ID       string     `json:"id"`
	URL      string     `json:"url"`
	Filename string     `json:"filename"`
	Category string     `json:"category"`
	SavePath string     `json:"savePath"`
	Status   TaskStatus `json:"status"`
	AddedAt  int64      `json:"addedAt"`
	Error    string     `json:"error,omitempty"`

	cancel context.CancelFunc
}

type Queue struct {
	mu         sync.RWMutex
	tasks      map[string]*DownloadTask
	order      []string
	downloader *Downloader
	cfg        *Config
	semaphore  chan struct{}
	idCounter  int
}

func NewQueue(cfg *Config) *Queue {
	return &Queue{
		tasks:      make(map[string]*DownloadTask),
		downloader: NewDownloader(),
		cfg:        cfg,
		semaphore:  make(chan struct{}, cfg.MaxConcurrent),
	}
}

// AddTask adds a task to the queue and starts it if slots available.
func (q *Queue) AddTask(task DownloadTask) (string, error) {
	q.mu.Lock()
	q.idCounter++
	task.ID     = fmt.Sprintf("df_%d_%d", time.Now().UnixMilli(), q.idCounter)
	task.Status = StatusQueued
	task.AddedAt = time.Now().Unix()
	q.tasks[task.ID] = &task
	q.order = append(q.order, task.ID)
	q.mu.Unlock()

	log.Printf("Task queued: %s %s", task.ID, task.URL)
	go q.processTask(task.ID)
	return task.ID, nil
}

func (q *Queue) processTask(id string) {
	// Acquire concurrency slot
	q.semaphore <- struct{}{}
	defer func() { <-q.semaphore }()

	q.mu.Lock()
	task := q.tasks[id]
	if task == nil || task.Status == StatusCancelled {
		q.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	task.cancel = cancel
	task.Status = StatusDownloading
	q.mu.Unlock()

	progressCh := make(chan DownloadProgress, 10)
	go func() {
		for range progressCh {} // drain — can send to extension later
	}()

	err := q.downloader.Download(ctx, *task, progressCh)
	close(progressCh)

	q.mu.Lock()
	if task.Status != StatusCancelled {
		if err != nil {
			task.Status = StatusFailed
			task.Error  = err.Error()
			log.Printf("Task failed %s: %v", id, err)
		} else {
			task.Status = StatusComplete
		}
	}
	q.mu.Unlock()
}

func (q *Queue) PauseTask(id string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	task := q.tasks[id]
	if task != nil && task.Status == StatusDownloading {
		if task.cancel != nil { task.cancel() }
		task.Status = StatusPaused
		log.Printf("Task paused: %s", id)
	}
}

func (q *Queue) ResumeTask(id string) {
	q.mu.RLock()
	task := q.tasks[id]
	q.mu.RUnlock()
	if task != nil && task.Status == StatusPaused {
		task.Status = StatusQueued
		go q.processTask(id)
	}
}

func (q *Queue) CancelTask(id string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	task := q.tasks[id]
	if task != nil {
		if task.cancel != nil { task.cancel() }
		task.Status = StatusCancelled
		log.Printf("Task cancelled: %s", id)
	}
}

func (q *Queue) GetStatus() map[string]interface{} {
	q.mu.RLock()
	defer q.mu.RUnlock()

	tasks := make([]map[string]interface{}, 0, len(q.order))
	for _, id := range q.order {
		t := q.tasks[id]
		if t == nil { continue }
		tasks = append(tasks, map[string]interface{}{
			"id":       t.ID,
			"filename": t.Filename,
			"status":   t.Status,
			"addedAt":  t.AddedAt,
			"error":    t.Error,
		})
	}

	active := 0
	for _, t := range q.tasks {
		if t.Status == StatusDownloading { active++ }
	}

	return map[string]interface{}{
		"tasks":  tasks,
		"active": active,
		"total":  len(q.tasks),
	}
}
