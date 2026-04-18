package datastore

// ReadKnowledge reads knowledge.json and returns it as an array.
// knowledge.json is always a plain array (no normalization needed).
func (s *Store) ReadKnowledge() ([]any, error) {
	v, err := s.readJSON("knowledge.json")
	if err != nil {
		return nil, err
	}
	if v == nil {
		return []any{}, nil
	}
	arr := asArray(v)
	if arr == nil {
		return []any{}, nil
	}
	return arr, nil
}

// ReadKnowledgeBase reads a single knowledge base by ID.
func (s *Store) ReadKnowledgeBase(id string) (map[string]any, error) {
	kbs, err := s.ReadKnowledge()
	if err != nil {
		return nil, err
	}
	return findByID(kbs, id), nil
}
