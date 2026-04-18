package datastore

// ReadConfig reads config.json and returns it as a map.
// No normalization needed — config.json is always a flat object.
func (s *Store) ReadConfig() (map[string]any, error) {
	v, err := s.readJSON("config.json")
	if err != nil {
		return nil, err
	}
	if v == nil {
		return map[string]any{}, nil
	}
	m := asMap(v)
	if m == nil {
		return map[string]any{}, nil
	}
	return m, nil
}
