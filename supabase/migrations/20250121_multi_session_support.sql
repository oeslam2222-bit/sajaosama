-- Migration: Support multiple concurrent sessions per role
-- Run this in Supabase SQL Editor
--
-- This migration changes the ezz_sessions table to allow multiple sessions
-- per role (RIDER/DRIVER/ADMIN) by adding a device_id column.
-- Each browser/device gets its own session, so you can log in from
-- multiple browsers simultaneously without conflicts.

-- 1. Create new table with multi-session schema
CREATE TABLE IF NOT EXISTS ezz_sessions_new (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL, -- 'RIDER' | 'DRIVER' | 'ADMIN'
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  updated_at TEXT
);

-- 2. Migrate existing sessions (if any) with a default device_id
--    Existing sessions get a fallback device_id so they remain valid
INSERT INTO ezz_sessions_new (id, role, user_id, device_id, updated_at)
SELECT 
  'session_' || role || '_' || COALESCE(user_id, 'unknown') || '_' || EXTRACT(EPOCH FROM NOW())::text AS id,
  role,
  user_id,
  'dev_legacy_' || role AS device_id,
  updated_at
FROM ezz_sessions;

-- 3. Drop old table
DROP TABLE ezz_sessions;

-- 4. Rename new table
ALTER TABLE ezz_sessions_new RENAME TO ezz_sessions;

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON ezz_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_role_device ON ezz_sessions(role, device_id);

-- 6. Re-enable RLS
ALTER TABLE ezz_sessions ENABLE ROW LEVEL SECURITY;

-- 7. Recreate policies for multi-session support
DROP POLICY IF EXISTS "Deny anon read sessions" ON ezz_sessions;
CREATE POLICY "Deny anon read sessions" ON ezz_sessions FOR SELECT USING (false);
DROP POLICY IF EXISTS "Allow public write sessions" ON ezz_sessions;
CREATE POLICY "Allow public write sessions" ON ezz_sessions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update sessions" ON ezz_sessions;
CREATE POLICY "Allow public update sessions" ON ezz_sessions FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete sessions" ON ezz_sessions;
CREATE POLICY "Allow public delete sessions" ON ezz_sessions FOR DELETE USING (true);
