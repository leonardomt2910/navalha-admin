import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://grgfmzueciolmdjeufwz.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZ2ZtenVlY2lvbG1kamV1Znd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNjQxMzksImV4cCI6MjA5MjY0MDEzOX0.lOYdvtdkXCYlYxjvJLjNZvZAoal0JW9yjaq-zLgmuNA"

// sessionStorage: sessão dura enquanto a aba estiver aberta.
// Fechar aba/browser descarta o token — próximo acesso exige login.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: sessionStorage,
    persistSession: true,
  },
})
