import { createClient } from '@supabase/supabase-js'
import { localDemoMode } from '../../features/local-demo/config'
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const backendConfigError = !localDemoMode&&Boolean(url || key) && !(url?.startsWith('https://') && key?.startsWith('sb_publishable_'))
export const supabase = !localDemoMode&&!backendConfigError && url && key ? createClient(url,key) : null
