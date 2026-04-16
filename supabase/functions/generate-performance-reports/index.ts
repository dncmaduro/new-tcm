import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PeriodType = "weekly" | "monthly" | "quarterly";

type GenerateBody = {
  periodType?: PeriodType;
  nowIso?: string;
};

type RoleInDepartmentRow = {
  profile_id: string;
  department_id: string | null;
  profiles: {
    id: string;
    leave_at: string | null;
  } | null;
};

type ProfileRow = {
  id: string;
  department_id: string | null;
};

type KrRow = {
  id: string;
  name: string;
  target: number | null;
  current: number | null;
  unit: string | null;
  weight: number | null;
  contribution_type: "direct" | "support";
};

type TaskSummaryRow = {
  task_count: number;
  completed_task_count: number;
  overdue_task_count: number;
};

const LOCAL_SUPABASE_URL = Deno.env.get("LOCAL_SUPABASE_URL");
const LOCAL_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const REPORT_CRON_SECRET = Deno.env.get("REPORT_CRON_SECRET");

function getPeriodRange(periodType: PeriodType, now = new Date()) {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (periodType === "weekly") {
    const day = utc.getUTCDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const thisWeekMonday = new Date(utc);
    thisWeekMonday.setUTCDate(utc.getUTCDate() - diffToMonday);

    const periodEnd = new Date(thisWeekMonday);
    periodEnd.setUTCDate(thisWeekMonday.getUTCDate() - 1);

    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodEnd.getUTCDate() - 6);

    const weekNum = isoWeekNumber(periodStart);
    const periodKey = `${periodStart.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;

    return {
      periodStart: toDateOnly(periodStart),
      periodEnd: toDateOnly(periodEnd),
      periodKey,
    };
  }

  if (periodType === "monthly") {
    const firstDayThisMonth = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), 1));
    const periodEnd = new Date(firstDayThisMonth);
    periodEnd.setUTCDate(0);

    const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1));
    const periodKey = `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, "0")}`;

    return {
      periodStart: toDateOnly(periodStart),
      periodEnd: toDateOnly(periodEnd),
      periodKey,
    };
  }

  const currentQuarter = Math.floor(utc.getUTCMonth() / 3) + 1;
  const prevQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const year = currentQuarter === 1 ? utc.getUTCFullYear() - 1 : utc.getUTCFullYear();

  const startMonth = (prevQuarter - 1) * 3;
  const periodStart = new Date(Date.UTC(year, startMonth, 1));
  const periodEnd = new Date(Date.UTC(year, startMonth + 3, 0));
  const periodKey = `${year}-Q${prevQuarter}`;

  return {
    periodStart: toDateOnly(periodStart),
    periodEnd: toDateOnly(periodEnd),
    periodKey,
  };
}

function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function calcProgress(target: number | null, current: number | null) {
  if (target == null || target <= 0 || current == null) return null;
  return Math.min((current / target) * 100, 100);
}

function weightedAverage(rows: Array<{ progress: number | null; weight: number | null }>) {
  const valid = rows.filter((r) => r.progress != null);
  if (!valid.length) return null;

  const sumWeight = valid.reduce((s, r) => s + (r.weight ?? 1), 0);
  if (sumWeight <= 0) return null;

  const score = valid.reduce((s, r) => s + (r.progress! * (r.weight ?? 1)), 0) / sumWeight;
  return round2(score);
}

function calcExecutionScore(taskCount: number, completedCount: number, overdueCount: number) {
  if (taskCount <= 0) return null;
  const base = (completedCount / taskCount) * 100;
  const penalty = taskCount > 0 ? (overdueCount / taskCount) * 20 : 0;
  return round2(Math.max(0, Math.min(100, base - penalty)));
}

function calcOverallScore(
  businessScore: number | null,
  supportScore: number | null,
  executionScore: number | null,
) {
  const b = businessScore ?? 0;
  const s = supportScore ?? 0;
  const e = executionScore ?? 0;

  const present =
    (businessScore != null ? 0.4 : 0) +
    (supportScore != null ? 0.3 : 0) +
    (executionScore != null ? 0.3 : 0);

  if (present === 0) return null;

  const weighted =
    (businessScore != null ? b * 0.4 : 0) +
    (supportScore != null ? s * 0.3 : 0) +
    (executionScore != null ? e * 0.3 : 0);

  return round2(weighted / present);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function safeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  return {
    message: String(err),
  };
}

async function fetchActiveProfilesWithDepartment(
  admin: ReturnType<typeof createClient>,
): Promise<ProfileRow[]> {
  const { data, error } = await admin
    .from("user_role_in_department")
    .select(`
      profile_id,
      department_id,
      profiles!inner (
        id,
        leave_at
      )
    `)
    .is("profiles.leave_at", null);

  if (error) throw error;

  const rows = (data ?? []) as RoleInDepartmentRow[];

  const profileMap = new Map<string, ProfileRow>();

  for (const row of rows) {
    if (!row.profile_id) continue;
    if (profileMap.has(row.profile_id)) continue;

    profileMap.set(row.profile_id, {
      id: row.profile_id,
      department_id: row.department_id ?? null,
    });
  }

  return Array.from(profileMap.values());
}

async function fetchKrs(
  admin: ReturnType<typeof createClient>,
  profileId: string,
  periodStart: string,
  periodEnd: string,
  contributionType: "direct" | "support",
): Promise<KrRow[]> {
  const { data, error } = await admin.rpc("get_profile_krs_for_period", {
    p_profile_id: profileId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_contribution_type: contributionType,
  });

  if (error) throw error;
  return (data ?? []) as KrRow[];
}

async function fetchTaskSummary(
  admin: ReturnType<typeof createClient>,
  profileId: string,
  periodStart: string,
  periodEnd: string,
): Promise<TaskSummaryRow> {
  const { data, error } = await admin.rpc("get_profile_task_summary_for_period", {
    p_profile_id: profileId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });

  if (error) throw error;

  return (data?.[0] ?? {
    task_count: 0,
    completed_task_count: 0,
    overdue_task_count: 0,
  }) as TaskSummaryRow;
}

async function fetchGoalCount(
  admin: ReturnType<typeof createClient>,
  profileId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const { data, error } = await admin.rpc("get_profile_goal_count_for_period", {
    p_profile_id: profileId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });

  if (error) throw error;
  return Number(data ?? 0);
}

serve(async (req) => {
  const startedAt = Date.now();

  try {
    console.log("[generate-performance-reports] function started");

    if (req.method !== "POST") {
      console.log("[generate-performance-reports] invalid method:", req.method);
      return json({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${REPORT_CRON_SECRET}`;

    console.log("[generate-performance-reports] auth received:", authHeader);
    console.log("[generate-performance-reports] auth matched:", authHeader === expected);

    if (authHeader !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!LOCAL_SUPABASE_URL) {
      throw new Error("LOCAL_SUPABASE_URL is not defined");
    }

    if (!LOCAL_SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("LOCAL_SUPABASE_SERVICE_ROLE_KEY is not defined");
    }

    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    console.log("[generate-performance-reports] body:", body);

    const periodType: PeriodType = body.periodType ?? "weekly";
    const now = body.nowIso ? new Date(body.nowIso) : new Date();

    const { periodStart, periodEnd, periodKey } = getPeriodRange(periodType, now);
    console.log("[generate-performance-reports] period:", {
      periodType,
      periodStart,
      periodEnd,
      periodKey,
    });

    const admin = createClient(
      LOCAL_SUPABASE_URL,
      LOCAL_SUPABASE_SERVICE_ROLE_KEY,
    );

    const profiles = await fetchActiveProfilesWithDepartment(admin);

    console.log("[generate-performance-reports] profiles fetched:", profiles.length);

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ profile_id: string; error: string }> = [];

    for (const profile of profiles) {
      try {
        console.log("[generate-performance-reports] processing profile:", profile.id);

        const { data: existing, error: existingError } = await admin
          .from("performance_reports")
          .select("id")
          .eq("profile_id", profile.id)
          .eq("period_type", periodType)
          .eq("period_key", periodKey)
          .maybeSingle();

        if (existingError) {
          console.error("[generate-performance-reports] existingError:", existingError);
          throw existingError;
        }

        if (existing) {
          skipped += 1;
          console.log("[generate-performance-reports] skipped existing report for profile:", profile.id);
          continue;
        }

        const directKrs = await fetchKrs(admin, profile.id, periodStart, periodEnd, "direct");
        const supportKrs = await fetchKrs(admin, profile.id, periodStart, periodEnd, "support");
        const taskSummary = await fetchTaskSummary(admin, profile.id, periodStart, periodEnd);
        const goalCount = await fetchGoalCount(admin, profile.id, periodStart, periodEnd);

        console.log("[generate-performance-reports] data summary:", {
          profileId: profile.id,
          departmentId: profile.department_id,
          directKrs: directKrs.length,
          supportKrs: supportKrs.length,
          taskSummary,
          goalCount,
        });

        const businessScore = weightedAverage(
          directKrs.map((kr) => ({
            progress: calcProgress(kr.target, kr.current),
            weight: kr.weight,
          })),
        );

        const supportScore = weightedAverage(
          supportKrs.map((kr) => ({
            progress: calcProgress(kr.target, kr.current),
            weight: kr.weight,
          })),
        );

        const executionScore = calcExecutionScore(
          taskSummary.task_count,
          taskSummary.completed_task_count,
          taskSummary.overdue_task_count,
        );

        const overallScore = calcOverallScore(
          businessScore,
          supportScore,
          executionScore,
        );

        const reportPayload = {
          profile_id: profile.id,
          department_id: profile.department_id,
          period_type: periodType,
          period_key: periodKey,
          period_start: periodStart,
          period_end: periodEnd,
          overall_score: overallScore,
          business_score: businessScore,
          support_score: supportScore,
          execution_score: executionScore,
          goal_count: goalCount,
          direct_kr_count: directKrs.length,
          support_kr_count: supportKrs.length,
          task_count: taskSummary.task_count,
          completed_task_count: taskSummary.completed_task_count,
          overdue_task_count: taskSummary.overdue_task_count,
          status: "draft",
        };

        const { data: report, error: reportError } = await admin
          .from("performance_reports")
          .insert(reportPayload)
          .select("id")
          .single();

        if (reportError) {
          console.error("[generate-performance-reports] report insert error:", reportError);
          throw reportError;
        }

        const items = [
          ...directKrs.map((kr) => ({
            performance_report_id: report.id,
            item_type: "direct_kr",
            reference_id: kr.id,
            name: kr.name,
            target_value: kr.target,
            current_value: kr.current,
            unit: kr.unit,
            progress_percent: calcProgress(kr.target, kr.current),
            weight: kr.weight,
            score: calcProgress(kr.target, kr.current),
            meta_json: null,
          })),
          ...supportKrs.map((kr) => ({
            performance_report_id: report.id,
            item_type: "support_kr",
            reference_id: kr.id,
            name: kr.name,
            target_value: kr.target,
            current_value: kr.current,
            unit: kr.unit,
            progress_percent: calcProgress(kr.target, kr.current),
            weight: kr.weight,
            score: calcProgress(kr.target, kr.current),
            meta_json: null,
          })),
          {
            performance_report_id: report.id,
            item_type: "execution",
            reference_id: null,
            name: "Tóm tắt thực thi",
            target_value: null,
            current_value: null,
            unit: null,
            progress_percent: executionScore,
            weight: null,
            score: executionScore,
            meta_json: {
              task_count: taskSummary.task_count,
              completed_task_count: taskSummary.completed_task_count,
              overdue_task_count: taskSummary.overdue_task_count,
            },
          },
        ];

        if (items.length > 0) {
          const { error: itemsError } = await admin
            .from("performance_report_items")
            .insert(items);

          if (itemsError) {
            console.error("[generate-performance-reports] items insert error:", itemsError);
            throw itemsError;
          }
        }

        created += 1;
        console.log("[generate-performance-reports] created report for profile:", profile.id);
      } catch (err) {
        failed += 1;

        console.error("[generate-performance-reports] profile failed:", {
          profileId: profile.id,
          error: safeError(err),
        });

        failures.push({
          profile_id: profile.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log("[generate-performance-reports] done:", {
      created,
      skipped,
      failed,
      durationMs: Date.now() - startedAt,
    });

    return json({
      ok: true,
      periodType,
      periodKey,
      periodStart,
      periodEnd,
      created,
      skipped,
      failed,
      failures,
    });
  } catch (err) {
    console.error("[generate-performance-reports] fatal error:", safeError(err));

    return json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});