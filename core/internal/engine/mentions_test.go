package engine

import (
	"reflect"
	"sort"
	"testing"
)

func TestParseMentions_Basic(t *testing.T) {
	agents := []AgentInfo{
		{ID: "a1", Name: "Alice"},
		{ID: "a2", Name: "Bob"},
	}
	ids := ParseMentions("hey @Alice, can you ask @Bob?", agents)
	sort.Strings(ids)
	want := []string{"a1", "a2"}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("got %v, want %v", ids, want)
	}
}

func TestParseMentions_CJKBoundary(t *testing.T) {
	// This is the critical test from lesson 2026-03-02:
	// \b doesn't work for CJK; must use (?=\W|$)
	agents := []AgentInfo{
		{ID: "a1", Name: "小明"},
		{ID: "a2", Name: "Reviewer"},
	}
	// CJK name followed by CJK punctuation
	ids := ParseMentions("@小明，你好", agents)
	if len(ids) != 1 || ids[0] != "a1" {
		t.Fatalf("expected [a1] for CJK boundary, got %v", ids)
	}

	// English name at end of sentence
	ids = ParseMentions("Ask @Reviewer.", agents)
	if len(ids) != 1 || ids[0] != "a2" {
		t.Fatalf("expected [a2] for English-trailing-punct, got %v", ids)
	}
}

func TestParseMentions_PartialMatchRejected(t *testing.T) {
	agents := []AgentInfo{
		{ID: "a1", Name: "Al"},
		{ID: "a2", Name: "Alice"},
	}
	// @Alice should NOT match "Al" (different word)
	ids := ParseMentions("@Alice", agents)
	sort.Strings(ids)
	// Alice matches Alice; Al doesn't match because "Alice" follows Al (word char)
	if len(ids) != 1 || ids[0] != "a2" {
		t.Fatalf("expected [a2] only, got %v", ids)
	}
}

func TestParseMentions_NoDuplicates(t *testing.T) {
	agents := []AgentInfo{{ID: "a1", Name: "Alice"}}
	ids := ParseMentions("@Alice and @Alice again", agents)
	if len(ids) != 1 {
		t.Fatalf("expected dedup, got %v", ids)
	}
}

func TestStripMentions(t *testing.T) {
	agents := []AgentInfo{{ID: "a1", Name: "Alice"}}
	result := StripMentions("hey @Alice, hi @Alice!", agents)
	if result == "" {
		t.Fatal("should not be empty")
	}
	// Should strip the @Alice tokens
	want := "hey , hi !"
	if result != want {
		t.Errorf("got %q, want %q", result, want)
	}
}

func TestResolveAddressees_SingleMention(t *testing.T) {
	agents := []AgentInfo{
		{ID: "a1", Name: "Alice"},
		{ID: "a2", Name: "Bob"},
	}
	ids := ResolveAddressees("hey @Alice", agents)
	if len(ids) != 1 || ids[0] != "a1" {
		t.Fatalf("expected [a1], got %v", ids)
	}
}

func TestResolveAddressees_MultipleMentions_NoModel(t *testing.T) {
	// Without DefaultUtilityModel, returns all mentioned
	DefaultUtilityModel = nil

	agents := []AgentInfo{
		{ID: "a1", Name: "Alice"},
		{ID: "a2", Name: "Bob"},
	}
	ids := ResolveAddressees("@Alice and @Bob", agents)
	sort.Strings(ids)
	if len(ids) != 2 {
		t.Fatalf("expected 2 addressees, got %v", ids)
	}
}

func TestResolveAddressees_WithUtilityModel(t *testing.T) {
	// Simulate utility model that picks only one addressee
	DefaultUtilityModel = func(text string, mentioned []AgentInfo) ([]string, error) {
		// Always pick the first mentioned agent
		if len(mentioned) > 0 {
			return []string{mentioned[0].ID}, nil
		}
		return nil, nil
	}
	defer func() { DefaultUtilityModel = nil }()

	agents := []AgentInfo{
		{ID: "a1", Name: "Alice"},
		{ID: "a2", Name: "Bob"},
	}
	ids := ResolveAddressees("@Alice and @Bob", agents)
	if len(ids) != 1 {
		t.Fatalf("expected utility model to narrow to 1, got %v", ids)
	}
}

func TestDispatchGroupTasks(t *testing.T) {
	if got := DispatchGroupTasks([]string{"a1"}); got != "sequential" {
		t.Errorf("single agent should be sequential, got %s", got)
	}
	if got := DispatchGroupTasks([]string{"a1", "a2"}); got != "concurrent" {
		t.Errorf("multiple agents should be concurrent, got %s", got)
	}
}
