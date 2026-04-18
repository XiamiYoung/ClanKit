package engine

import (
	"fmt"
	"sync"

	"github.com/nicekid1/ClankAI/core/internal/llm"
)

const maxCollaborationRounds = 10

// AgentRun holds isolation context for a single agent in a group chat.
type AgentRun struct {
	AgentID      string
	AgentName    string
	Loop         *AgentLoop
	Messages     []map[string]any
	ResponseText string // accumulated from Loop.Run() — used for @mention scanning
}

// Orchestrator manages multi-agent group chat execution.
type Orchestrator struct {
	agents     map[string]*AgentRun // agentID → run
	emit       func(llm.Chunk)
	cancelled  bool
	mu         sync.Mutex
}

// NewOrchestrator creates a new orchestrator.
func NewOrchestrator(emit func(llm.Chunk)) *Orchestrator {
	return &Orchestrator{
		agents: make(map[string]*AgentRun),
		emit:   emit,
	}
}

// AddAgent registers an agent for this group chat.
func (o *Orchestrator) AddAgent(run *AgentRun) {
	o.agents[run.AgentID] = run
}

// Cancel stops the orchestration loop.
func (o *Orchestrator) Cancel() {
	o.mu.Lock()
	o.cancelled = true
	// Copy agent refs under lock to iterate safely
	runs := make([]*AgentRun, 0, len(o.agents))
	for _, r := range o.agents {
		runs = append(runs, r)
	}
	o.mu.Unlock()

	for _, run := range runs {
		run.Loop.Stop()
	}
}

// RunGroup executes a group chat round.
//
// Flow:
//  1. Determine initial target agents from user @mentions
//  2. Run first round (concurrent or sequential based on dispatch mode)
//  3. Scan responses for @mentions → trigger collaboration rounds
//  4. Repeat until no new mentions or max rounds
func (o *Orchestrator) RunGroup(targetIDs []string, dispatchMode string) error {
	// First round
	firstRound := o.filterAgents(targetIDs)
	if len(firstRound) == 0 {
		return fmt.Errorf("no target agents found")
	}

	if err := o.runRound(firstRound, dispatchMode); err != nil {
		return err
	}

	// Collaboration loop
	for round := 1; round <= maxCollaborationRounds; round++ {
		if o.isCancelled() {
			break
		}

		// Scan last responses for @mentions
		nextIDs := o.scanForMentions(firstRound)
		if len(nextIDs) == 0 {
			break
		}

		nextRound := o.filterAgents(nextIDs)
		if len(nextRound) == 0 {
			break
		}

		o.emit(llm.Chunk{Type: "collaboration_round_done", Details: map[string]any{"round": round}})

		if err := o.runRound(nextRound, "sequential"); err != nil {
			return err
		}
		firstRound = nextRound
	}

	return nil
}

func (o *Orchestrator) runRound(runs []*AgentRun, mode string) error {
	if mode == "concurrent" && len(runs) > 1 {
		return o.runConcurrent(runs)
	}
	return o.runSequential(runs)
}

func (o *Orchestrator) runConcurrent(runs []*AgentRun) error {
	var wg sync.WaitGroup
	errs := make(chan error, len(runs))

	for _, run := range runs {
		wg.Add(1)
		go func(r *AgentRun) {
			defer wg.Done()
			o.emitAgentStart(r)
			finalText, err := r.Loop.Run(r.Messages)
			r.ResponseText = finalText
			o.emitAgentEnd(r)
			if err != nil {
				errs <- fmt.Errorf("agent %s: %w", r.AgentName, err)
			}
		}(run)
	}

	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

func (o *Orchestrator) runSequential(runs []*AgentRun) error {
	for _, run := range runs {
		if o.isCancelled() {
			break
		}
		o.emitAgentStart(run)
		finalText, err := run.Loop.Run(run.Messages)
		run.ResponseText = finalText
		o.emitAgentEnd(run)
		if err != nil {
			return fmt.Errorf("agent %s: %w", run.AgentName, err)
		}
	}
	return nil
}

func (o *Orchestrator) emitAgentStart(run *AgentRun) {
	o.emit(llm.Chunk{
		Type: "agent_start", AgentID: run.AgentID, AgentName: run.AgentName,
	})
}

func (o *Orchestrator) emitAgentEnd(run *AgentRun) {
	o.emit(llm.Chunk{
		Type: "agent_end", AgentID: run.AgentID, AgentName: run.AgentName,
	})
}

func (o *Orchestrator) filterAgents(ids []string) []*AgentRun {
	idSet := make(map[string]bool)
	for _, id := range ids {
		idSet[id] = true
	}
	var result []*AgentRun
	for _, run := range o.agents {
		if idSet[run.AgentID] {
			result = append(result, run)
		}
	}
	return result
}

func (o *Orchestrator) isCancelled() bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.cancelled
}

// scanForMentions finds @mentions in the last response text of each agent.
func (o *Orchestrator) scanForMentions(lastRound []*AgentRun) []string {
	// Build agent info list for ParseMentions
	var allAgents []AgentInfo
	for _, run := range o.agents {
		allAgents = append(allAgents, AgentInfo{
			ID:   run.AgentID,
			Name: run.AgentName,
		})
	}

	mentionedIDs := make(map[string]bool)
	for _, run := range lastRound {
		if run.ResponseText == "" {
			continue
		}
		// Find @mentions in this agent's response, excluding self-mentions
		ids := ResolveAddressees(run.ResponseText, allAgents)
		for _, id := range ids {
			if id != run.AgentID { // don't let an agent trigger itself
				mentionedIDs[id] = true
			}
		}
	}

	var ids []string
	for id := range mentionedIDs {
		ids = append(ids, id)
	}
	return ids
}
