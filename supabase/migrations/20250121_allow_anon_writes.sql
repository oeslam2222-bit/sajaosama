-- Allow anon users to INSERT/UPDATE/DELETE on tables the app writes to
-- This is required because the app uses the Supabase anon key directly from client-side code
-- Data isolation is enforced client-side in App.tsx / supabaseService.ts

-- Riders
CREATE POLICY "anon can insert riders" ON ezz_riders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update riders" ON ezz_riders FOR UPDATE TO anon USING (true);
CREATE POLICY "anon can delete riders" ON ezz_riders FOR DELETE TO anon USING (true);

-- Drivers
CREATE POLICY "anon can insert drivers" ON ezz_drivers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update drivers" ON ezz_drivers FOR UPDATE TO anon USING (true);
CREATE POLICY "anon can delete drivers" ON ezz_drivers FOR DELETE TO anon USING (true);

-- Active Trip
CREATE POLICY "anon can insert active_trip" ON ezz_active_trip FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update active_trip" ON ezz_active_trip FOR UPDATE TO anon USING (true);
CREATE POLICY "anon can delete active_trip" ON ezz_active_trip FOR DELETE TO anon USING (true);

-- Trips History
CREATE POLICY "anon can insert trips_history" ON ezz_trips_history FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update trips_history" ON ezz_trips_history FOR UPDATE TO anon USING (true);
CREATE POLICY "anon can delete trips_history" ON ezz_trips_history FOR DELETE TO anon USING (true);

-- Sessions
CREATE POLICY "anon can insert sessions" ON ezz_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update sessions" ON ezz_sessions FOR UPDATE TO anon USING (true);
CREATE POLICY "anon can delete sessions" ON ezz_sessions FOR DELETE TO anon USING (true);

-- Stats
CREATE POLICY "anon can insert stats" ON ezz_stats FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update stats" ON ezz_stats FOR UPDATE TO anon USING (true);
CREATE POLICY "anon can delete stats" ON ezz_stats FOR DELETE TO anon USING (true);

-- Locations (admin manages locations)
CREATE POLICY "anon can insert locations" ON ezz_locations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update locations" ON ezz_locations FOR UPDATE TO anon USING (true);
CREATE POLICY "anon can delete locations" ON ezz_locations FOR DELETE TO anon USING (true);

-- Admin
CREATE POLICY "anon can insert admin" ON ezz_admin FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update admin" ON ezz_admin FOR UPDATE TO anon USING (true);
CREATE POLICY "anon can delete admin" ON ezz_admin FOR DELETE TO anon USING (true);
