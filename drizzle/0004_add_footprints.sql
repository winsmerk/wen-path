CREATE TABLE footprints (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
  status TEXT NOT NULL, content TEXT NOT NULL, visited_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE footprint_images (
  id TEXT PRIMARY KEY, footprint_id TEXT NOT NULL, user_id TEXT NOT NULL,
  object_key TEXT NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_footprints_user_status ON footprints(user_id, status);
CREATE INDEX idx_footprint_images_footprint ON footprint_images(footprint_id, user_id);
