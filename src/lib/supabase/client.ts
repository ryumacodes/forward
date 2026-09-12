import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
// Empty placeholders keep the isolated demo available. Partial configuration fails visibly.
export const backendConfigError = Boolean(url || key) && !(url?.startsWith('https://') && key?.startsWith('sb_publishable_'))
export const supabase = !backendConfigError && url && key ? createClient(url,key) : null
