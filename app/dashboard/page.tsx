"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentProfile } from "@/lib/current-user";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type Profile = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  active?: boolean | null;
  phone?: string | null;
  employee_code?: string | null;
  email?: string | null;
  authEmail?: string;
};

type DashboardData = {
  revenue?: number;
  gross_profit?: number;
  expenses?: number;
  net_profit?: number;
  transactions?: number;
  items_sold?: number;
  low_stock?: number;
  products?: number;
};

type SaleRow = {
  id: string;
  employee_id: string;
  quantity: number;
  total: number;
  profit?: number;
  sold_at: string;
};

type EmployeeDashboardData = {
  day_revenue: number;
  day_transactions: number;
  day_items: number;
  week_revenue: number;
  week_items: number;
  month_revenue: number;
  month_items: number;
  year_revenue: number;
  year_items: number;
};

const EMPTY_EMPLOYEE_DATA: EmployeeDashboardData = {
  day_revenue: 0,
  day_transactions: 0,
  day_items: 0,
  week_revenue: 0,
  week_items: 0,
  month_revenue: 0,
  month_items: 0,
  year_revenue: 0,
  year_items: 0,
};

function getEthiopiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((x) => x.type === type)?.value || "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function ethiopiaDateToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
) {
  return new Date(
    `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day
      .toString()
      .padStart(2, "0")}T${hour
      .toString()
      .padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}:${second
      .toString()
      .padStart(2, "0")}+03:00`
  );
}

function getWeekStartEthiopia() {
  const now = new Date();
  const parts = getEthiopiaParts(now);

  const localMidnightUtc = ethiopiaDateToUtc(
    parts.year,
    parts.month,
    parts.day,
    0,
    0,
    0
  );

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    weekday: "short",
  }).format(localMidnightUtc);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const currentDay = map[weekday] ?? 1;

  const daysSinceMonday =
    currentDay === 0
      ? 6
      : currentDay - 1;

  return new Date(
    localMidnightUtc.getTime() -
      daysSinceMonday *
        24 *
        60 *
        60 *
        1000
  );
}

function calculateEmployeeDashboard(
  sales: SaleRow[]
): EmployeeDashboardData {
  const now = new Date();
  const today = getEthiopiaParts(now);

  const dayStart = ethiopiaDateToUtc(
    today.year,
    today.month,
    today.day,
    0,
    0,
    0
  );

  const tomorrowStart = new Date(
    dayStart.getTime() +
      24 * 60 * 60 * 1000
  );

  const weekStart = getWeekStartEthiopia();

  const monthStart = ethiopiaDateToUtc(
    today.year,
    today.month,
    1,
    0,
    0,
    0
  );

  const yearStart = ethiopiaDateToUtc(
    today.year,
    1,
    1,
    0,
    0,
    0
  );

  let dayRevenue = 0;
  let dayTransactions = 0;
  let dayItems = 0;

  let weekRevenue = 0;
  let weekItems = 0;

  let monthRevenue = 0;
  let monthItems = 0;

  let yearRevenue = 0;
  let yearItems = 0;

  for (const sale of sales) {
    const soldAt = new Date(sale.sold_at);
    const total = Number(sale.total || 0);
    const quantity = Number(sale.quantity || 0);

    if (
      soldAt >= dayStart &&
      soldAt < tomorrowStart
    ) {
      dayRevenue += total;
      dayTransactions += 1;
      dayItems += quantity;
    }

    if (soldAt >= weekStart) {
      weekRevenue += total;
      weekItems += quantity;
    }

    if (soldAt >= monthStart) {
      monthRevenue += total;
      monthItems += quantity;
    }

    if (soldAt >= yearStart) {
      yearRevenue += total;
      yearItems += quantity;
    }
  }

  return {
    day_revenue: dayRevenue,
    day_transactions: dayTransactions,
    day_items: dayItems,

    week_revenue: weekRevenue,
    week_items: weekItems,

    month_revenue: monthRevenue,
    month_items: monthItems,

    year_revenue: yearRevenue,
    year_items: yearItems,
  };
}

export default function Dashboard() {
  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [dashboard, setDashboard] =
    useState<DashboardData>({});

  const [mine, setMine] =
    useState<EmployeeDashboardData>(
      EMPTY_EMPLOYEE_DATA
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const loadManagementDashboard =
    useCallback(async () => {
      const sb = supabaseBrowser();

      const {
        data,
        error: rpcError,
      } = await sb.rpc(
        "dashboard_summary"
      );

      if (rpcError) {
        throw rpcError;
      }

      const result = Array.isArray(data)
        ? data[0] || {}
        : data || {};

      setDashboard(result);
    }, []);

  const loadEmployeeDashboard =
    useCallback(
      async (currentProfile: Profile) => {
        const sb = supabaseBrowser();

        console.log(
          "================================"
        );

        console.log(
          "EMPLOYEE DASHBOARD"
        );

        console.log(
          "Employee:",
          currentProfile.full_name
        );

        console.log(
          "Employee ID:",
          currentProfile.id
        );

        console.log(
          "Employee Code:",
          currentProfile.employee_code
        );

        console.log(
          "================================"
        );

        const yearParts =
          getEthiopiaParts();

        const yearStart =
          ethiopiaDateToUtc(
            yearParts.year,
            1,
            1,
            0,
            0,
            0
          );

        const {
          data: sales,
          error: salesError,
        } = await sb
          .from("sales")
          .select(
            "id,employee_id,quantity,total,profit,sold_at"
          )
          .eq(
            "employee_id",
            currentProfile.id
          )
          .gte(
            "sold_at",
            yearStart.toISOString()
          )
          .order("sold_at", {
            ascending: false,
          });

        console.log(
          "EMPLOYEE SALES:",
          sales
        );

        console.log(
          "EMPLOYEE SALES ERROR:",
          salesError
        );

        if (salesError) {
          throw salesError;
        }

        const result =
          calculateEmployeeDashboard(
            (sales || []) as SaleRow[]
          );

        console.log(
          "EMPLOYEE DASHBOARD RESULT:",
          result
        );

        setMine(result);
        setDashboard({});
      },
      []
    );

  const load = useCallback(
    async () => {
      try {
        setLoading(true);
        setError("");

        const p =
          await getCurrentProfile();

        console.log(
          "CURRENT PROFILE:",
          p
        );

        if (!p) {
          setProfile(null);
          return;
        }

        setProfile(p);

        const role = String(
          p.role || ""
        )
          .trim()
          .toUpperCase();

        console.log(
          "CURRENT ROLE:",
          role
        );

        if (
          role === "CEO" ||
          role === "ADMIN"
        ) {
          await loadManagementDashboard();
        } else {
          await loadEmployeeDashboard(p);
        }
      } catch (err) {
        console.error(
          "DASHBOARD ERROR:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Could not load dashboard."
        );
      } finally {
        setLoading(false);
      }
    },
    [
      loadManagementDashboard,
      loadEmployeeDashboard,
    ]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sb = supabaseBrowser();

    const channel =
      sb.channel(
        "dashboard-live-sales"
      );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sales",
      },
      async (
        payload: RealtimePostgresChangesPayload<{
          id: string;
          employee_id: string;
          quantity: number;
          total: number;
          profit?: number;
          sold_at: string;
        }>
      ) => {
        console.log(
          "SALE DATABASE CHANGE:",
          payload
        );

        const p =
          await getCurrentProfile();

        if (!p) {
          return;
        }

        setProfile(p);

        const role = String(
          p.role || ""
        )
          .trim()
          .toUpperCase();

        try {
          if (
            role === "CEO" ||
            role === "ADMIN"
          ) {
            await loadManagementDashboard();
          } else {
            await loadEmployeeDashboard(p);
          }
        } catch (err) {
          console.error(
            "REALTIME DASHBOARD ERROR:",
            err
          );
        }
      }
    );

    channel.subscribe(
      (status: string) => {
        console.log(
          "Dashboard realtime:",
          status
        );
      }
    );

    return () => {
      sb.removeChannel(channel);
    };
  }, [
    loadManagementDashboard,
    loadEmployeeDashboard,
  ]);

  const role = String(
    profile?.role || ""
  )
    .trim()
    .toUpperCase();

  const management =
    role === "CEO" ||
    role === "ADMIN";

  return (
    <Shell>
      <h1>
        {management
          ? "CEO Dashboard"
          : "My Employee Dashboard"}
      </h1>

      <p className="muted">
        Welcome,{" "}
        <b>
          {profile?.full_name ||
            profile?.authEmail ||
            "User"}
        </b>

        {profile?.employee_code
          ? ` • ${profile.employee_code}`
          : ""}
      </p>

      {error && (
        <div className="notice">
          <b>Dashboard Error:</b>{" "}
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading dashboard...</p>
      ) : management ? (
        <>
          <div className="cards">
            <Metric
              title="Today Revenue"
              value={dashboard.revenue}
            />

            <Metric
              title="Gross Profit"
              value={dashboard.gross_profit}
            />

            <Metric
              title="Expenses"
              value={dashboard.expenses}
            />

            <Metric
              title="Net Profit"
              value={dashboard.net_profit}
            />
          </div>

          <div
            className="cards"
            style={{
              marginTop: 14,
            }}
          >
            <Metric
              title="Transactions"
              value={
                dashboard.transactions
              }
              money={false}
            />

            <Metric
              title="Items Sold"
              value={
                dashboard.items_sold
              }
              money={false}
            />

            <Metric
              title="Low Stock"
              value={
                dashboard.low_stock
              }
              money={false}
            />

            <Metric
              title="Products"
              value={
                dashboard.products
              }
              money={false}
            />
          </div>

          <div className="notice">
            All financial and stock
            numbers are calculated
            from the central PostgreSQL
            database.
          </div>
        </>
      ) : (
        <>
          <div className="cards">
            <Metric
              title="Today's Sales"
              value={
                mine.day_revenue
              }
            />

            <Metric
              title="Today's Transactions"
              value={
                mine.day_transactions
              }
              money={false}
            />

            <Metric
              title="Today's Items"
              value={
                mine.day_items
              }
              money={false}
            />

            <Metric
              title="This Month"
              value={
                mine.month_revenue
              }
            />
          </div>

          <div
            className="cards"
            style={{
              marginTop: 14,
            }}
          >
            <Metric
              title="This Week"
              value={
                mine.week_revenue
              }
            />

            <Metric
              title="Week Items"
              value={
                mine.week_items
              }
              money={false}
            />

            <Metric
              title="This Month Items"
              value={
                mine.month_items
              }
              money={false}
            />

            <Metric
              title="Year Sales"
              value={
                mine.year_revenue
              }
            />
          </div>

          <div
            className="cards"
            style={{
              marginTop: 14,
            }}
          >
            <Metric
              title="Year Items"
              value={
                mine.year_items
              }
              money={false}
            />
          </div>

          <div className="notice">
            Your dashboard shows only
            sales recorded under your
            employee account.
          </div>
        </>
      )}
    </Shell>
  );
}

function Metric({
  title,
  value,
  money = true,
}: {
  title: string;
  value: any;
  money?: boolean;
}) {
  const numberValue =
    Number(value || 0);

  return (
    <div className="card">
      <div>{title}</div>

      <div className="metric">
        {money
          ? `${numberValue.toFixed(
              2
            )} Birr`
          : numberValue}
      </div>
    </div>
  );
}