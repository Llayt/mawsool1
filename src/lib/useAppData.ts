import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Agency, Policy, PolicyClause, Service, Task, Evidence, Notification } from './types';

interface AppData {
  agencies: Agency[];
  policies: Policy[];
  clauses: PolicyClause[];
  services: Service[];
  tasks: Task[];
  evidence: Evidence[];
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAppData(): AppData {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [clauses, setClauses] = useState<PolicyClause[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: ag, error: agErr },
        { data: pol, error: polErr },
        { data: cl, error: clErr },
        { data: sv, error: svErr },
        { data: tk, error: tkErr },
        { data: ev, error: evErr },
        { data: nt, error: ntErr },
      ] = await Promise.all([
        supabase.from('agencies').select('*').order('name'),
        supabase.from('policies').select('*').order('created_at', { ascending: false }),
        supabase.from('policy_clauses').select('*').order('created_at'),
        supabase.from('services').select('*').order('name'),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('evidence').select('*').order('submitted_at', { ascending: false }),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }),
      ]);

      if (agErr) throw agErr;
      if (polErr) throw polErr;
      if (clErr) throw clErr;
      if (svErr) throw svErr;
      if (tkErr) throw tkErr;
      if (evErr) throw evErr;
      if (ntErr) throw ntErr;

      setAgencies(ag || []);
      setPolicies(pol || []);
      setClauses(cl || []);
      setServices(sv || []);
      setTasks(tk || []);
      setEvidence(ev || []);
      setNotifications(nt || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ في تحميل البيانات';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { agencies, policies, clauses, services, tasks, evidence, notifications, loading, error, refresh: load };
}
