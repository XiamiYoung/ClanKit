package datastore

// WriteConfig writes the full config.json.
func (s *Store) WriteConfig(config map[string]any) error {
	return s.writeJSON("config.json", config)
}

// UpdateConfig merges partial fields into config.json (read-modify-write).
func (s *Store) UpdateConfig(partial map[string]any) (map[string]any, error) {
	current, err := s.ReadConfig()
	if err != nil {
		return nil, err
	}
	for k, v := range partial {
		current[k] = v
	}
	if err := s.writeJSON("config.json", current); err != nil {
		return nil, err
	}
	return current, nil
}
