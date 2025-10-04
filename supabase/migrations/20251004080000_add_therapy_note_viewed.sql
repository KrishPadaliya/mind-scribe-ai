-- Add therapy_note_viewed flag to journals
ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS therapy_note_viewed BOOLEAN DEFAULT FALSE;