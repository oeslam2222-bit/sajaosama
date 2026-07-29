import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hntqgrybbtydtgkinscw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhudHFncnliYnR5ZHRna2luc2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Mjc3ODMsImV4cCI6MjA5OTEwMzc4M30.UHRHAz-iWykzlF4fA8AP2VbNkcj1jMVnQq1p14EbDJk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
