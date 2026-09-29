import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Read what an email link put in the address bar before Supabase tidies it away.
const fromHash = new URLSearchParams(window.location.hash.slice(1));
const fromQuery = new URLSearchParams(window.location.search);
export const RESET_PATH = '/reset-password';
export const cameFromRecoveryLink =
  window.location.pathname.startsWith(RESET_PATH) ||
  fromHash.get('type') === 'recovery' ||
  fromQuery.get('type') === 'recovery';
export const emailLinkError = {
  code: fromHash.get('error_code') || fromQuery.get('error_code') || '',
  description: fromHash.get('error_description') || fromQuery.get('error_description') || '',
};

export const isConfigured = Boolean(url && key);
export const supabase = isConfigured ? createClient(url, key) : null;

export const SITE_NAME = import.meta.env.VITE_SITE_NAME || 'The Neev Network';
export const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_NAME || 'Neev Academy';

// Profile columns members are allowed to read (never use '*' on profiles).
export const PROFILE_COLS = 'id, full_name, role, batch_year, is_admin, status, headline, bio, location, university, field, major, subjects, teaches, shared_email, avatar_path, created_at';
export const AUTHOR_COLS = 'id, full_name, role, batch_year, avatar_path, field';
