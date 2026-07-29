// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export default async (req: Request, env: Env) => {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { body } = await req.json();

    if (!body || !body.table) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { table, action, data, filters } = body;

    let result;

    switch (table) {
      case 'ezz_drivers':
        if (action === 'upsert') {
          const { data: response, error } = await supabase
            .from('ezz_drivers')
            .upsert(data, { onConflict: 'id' });
          if (error) throw error;
          result = response;
        } else if (action === 'delete') {
          const { data: response, error } = await supabase
            .from('ezz_drivers')
            .delete()
            .eq('id', data.id);
          if (error) throw error;
          result = response;
        } else if (action === 'select') {
          let query = supabase.from('ezz_drivers').select('*');
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              query = query.eq(key, value);
            });
          }
          const { data: response, error } = await query;
          if (error) throw error;
          result = response;
        }
        break;

      case 'ezz_riders':
        if (action === 'upsert') {
          const { data: response, error } = await supabase
            .from('ezz_riders')
            .upsert(data, { onConflict: 'id' });
          if (error) throw error;
          result = response;
        } else if (action === 'select') {
          let query = supabase.from('ezz_riders').select('*');
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              query = query.eq(key, value);
            });
          }
          const { data: response, error } = await query;
          if (error) throw error;
          result = response;
        } else if (action === 'delete') {
          const { error } = await supabase
            .from('ezz_riders')
            .delete()
            .eq('id', payload.id);
          if (error) throw error;
          result = { success: true };
        }
        break;

      case 'ezz_active_trip':
        if (action === 'delete') {
          const { error } = await supabase.from('ezz_active_trip').delete().neq('id', 'dummy');
          if (error) throw error;
          result = { success: true };
        } else if (action === 'insert') {
          const { data: response, error } = await supabase
            .from('ezz_active_trip')
            .insert(data);
          if (error) throw error;
          result = response;
        } else if (action === 'select') {
          const { data: response, error } = await supabase
            .from('ezz_active_trip')
            .select('*')
            .limit(1);
          if (error) throw error;
          result = response;
        }
        break;

      case 'ezz_trips_history':
        if (action === 'upsert') {
          const { data: response, error } = await supabase
            .from('ezz_trips_history')
            .upsert(data, { onConflict: 'id' });
          if (error) throw error;
          result = response;
        } else if (action === 'delete') {
          const { error } = await supabase.from('ezz_trips_history').delete().neq('id', 'dummy');
          if (error) throw error;
          result = { success: true };
        } else if (action === 'select') {
          let query = supabase.from('ezz_trips_history').select('*');
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              if (key === 'gte' || key === 'lte') {
                Object.entries(value as any).forEach(([col, val]) => {
                  if (key === 'gte') query = query.gte(col, val as any);
                  else query = query.lte(col, val as any);
                });
              } else {
                query = query.eq(key, value);
              }
            });
          }
          const { data: response, error } = await query;
          if (error) throw error;
          result = response;
        }
        break;

      case 'ezz_locations':
        if (action === 'upsert') {
          const { data: response, error } = await supabase
            .from('ezz_locations')
            .upsert(data, { onConflict: 'id' });
          if (error) throw error;
          result = response;
        } else if (action === 'delete') {
          const { error } = await supabase
            .from('ezz_locations')
            .delete()
            .eq('id', data.id);
          if (error) throw error;
          result = { success: true };
        } else if (action === 'select') {
          let query = supabase.from('ezz_locations').select('*');
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              query = query.eq(key, value);
            });
          }
          const { data: response, error } = await query;
          if (error) throw error;
          result = response;
        }
        break;

      case 'ezz_stats':
        if (action === 'upsert') {
          const { data: response, error } = await supabase
            .from('ezz_stats')
            .upsert(data, { onConflict: 'id' });
          if (error) throw error;
          result = response;
        } else if (action === 'select') {
          const { data: response, error } = await supabase
            .from('ezz_stats')
            .select('*')
            .eq('id', 'singleton')
            .single();
          if (error) throw error;
          result = response;
        }
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown table: ${table}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Edge Function error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
