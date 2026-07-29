/**
 * SECURITY: Supabase Admin Client
 * 
 * ⚠️  هذا الملف يستخدم مفتاح service_role ولا يجب استخدامه في الكود العميل (Client-side)
 * ⚠️  استخدمه فقط في:
 *     - Supabase Edge Functions
 *     - Node.js Backend Server
 *     --serverless functions
 * 
 * كشف هذا المفتاح في العميل يعني تنحية أمان RLS بالكامل.
 * 
 * أنشئ ملف .env في جذر المشروع:
 * SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    'Supabase Admin Client requires SUPABASE_SERVICE_ROLE_KEY in .env (not VITE_ prefix). ' +
    'This file should ONLY be used in server-side/Edge Function environment.'
  );
}

export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;
