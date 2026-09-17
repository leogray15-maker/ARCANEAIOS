/**
 * What the build knew about Supabase. The URL is public and fixed for the
 * project; the key is the anon/publishable key, which is designed to ship
 * in a browser bundle — row-level security is what protects the data.
 * Nothing privileged is ever read here.
 */
/* global __SUPABASE_URL__, __SUPABASE_ANON__ */
export const SUPABASE_URL = (typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__) || 'https://pjdzdfmnfuneumzqoijn.supabase.co';
export const SUPABASE_KEY = typeof __SUPABASE_ANON__ !== 'undefined' ? __SUPABASE_ANON__ : '';
