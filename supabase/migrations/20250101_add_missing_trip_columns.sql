-- Add missing columns to ezz_active_trip table
-- Run this in Supabase SQL Editor

ALTER TABLE public.ezz_active_trip
  ADD COLUMN IF NOT EXISTS pickup_landmark TEXT,
  ADD COLUMN IF NOT EXISTS eta_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS requested_vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS route_geometry JSONB,
  ADD COLUMN IF NOT EXISTS offered_driver_ids TEXT[],
  ADD COLUMN IF NOT EXISTS current_offered_driver_id TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_timer INTEGER DEFAULT 600,
  ADD COLUMN IF NOT EXISTS dispatch_timer_max INTEGER DEFAULT 600;

-- Create index for faster filtering by status
CREATE INDEX IF NOT EXISTS idx_ezz_active_trip_status ON public.ezz_active_trip(status);

-- Enable realtime for the table (required for Supabase Realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE public.ezz_active_trip;
