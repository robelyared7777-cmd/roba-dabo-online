"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentProfile } from "@/lib/current-user";

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

type EmployeeDashboardData = {
  day_revenue?: number;
  day_transactions?: number;
  day_items?: number;
  week_revenue?: number;
  week_items?: number;
  month_revenue?: number;
  year_revenue?: number;
  year_items?: number;
};

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const [dashboard, setDashboard] =
    useState<DashboardData>({});

  const [mine, setMine] =
    useState<EmployeeDashboardData>({});

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const loadDashboard = useCallback(
    async (currentProfile: Profile) => {
      const sb = supabaseBrowser();

      try {
        setError("");

        const role = String(
          currentProfile.role || ""
        )
          .trim()
          .toUpperCase();

        console.log("================================");
        console.log("ROBA DABO DASHBOARD");
        console.log("USER ID:", currentProfile.id);
        console.log("NAME:", currentProfile.full_name);
        console.log(
          "EMPLOYEE CODE:",
          currentProfile.employee_code
        );
        console.log("ROLE:", role);
        console.log("================================");

        // ==========================================
        // CEO / ADMIN
        // ==========================================

        if (
          role === "CEO" ||
          role === "ADMIN"
        ) {
          const {
            data,
            error: rpcError,
          } = await sb.rpc(
            "dashboard_summary"
          );

          console.log(
            "MANAGEMENT RPC DATA:",
            data
          );

          console.log(
            "MANAGEMENT RPC ERROR:",
            rpcError
          );

          if (rpcError) {
            setError(rpcError.message);
            setDashboard({});
            return;
          }

          const result = Array.isArray(data)
            ? data[0] || {}
            : data || {};

          setDashboard(result);
          setMine({});

          return;
        }

        // ==========================================
        // EMPLOYEE
        // ==========================================

        const {
          data,
          error: employeeError,
        } = await sb.rpc(
          "employee_sales_summary"
        );

        console.log(
          "================================"
        );

        console.log(
          "EMPLOYEE RPC DATA:",
          data
        );

        console.log(
          "EMPLOYEE RPC ERROR:",
          employeeError
        );

        console.log(
          "================================"
        );

        if (employeeError) {
          setError(employeeError.message);
          setMine({});
          return;
        }

        const row: EmployeeDashboardData =
          Array.isArray(data)
            ? data[0] || {}
            : data || {};

        console.log(
          "EMPLOYEE DASHBOARD ROW:",
          row
        );

        const employeeData: EmployeeDashboardData = {
          day_revenue: Number(
            row.day_revenue || 0
          ),

          day_transactions: Number(
            row.day_transactions || 0
          ),

          day_items: Number(
            row.day_items || 0
          ),

          week_revenue: Number(
            row.week_revenue || 0
          ),

          week_items: Number(
            row.week_items || 0
          ),

          month_revenue: Number(
            row.month_revenue || 0
          ),

          year_revenue: Number(
            row.year_revenue || 0
          ),

          year_items: Number(
            row.year_items || 0
          ),
        };

        console.log(
          "EMPLOYEE DATA USED BY UI:",
          employeeData
        );

        setMine(employeeData);
        setDashboard({});
      } catch (err) {
        console.error(
          "DASHBOARD LOAD ERROR:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Could not load dashboard."
        );
      }
    },
    []
  );

  // ==========================================
  // LOAD PROFILE
  // ==========================================

  const load = useCallback(async () => {
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

      await loadDashboard(p);
    } catch (err) {
      console.error(
        "PROFILE ERROR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not load account."
      );
    } finally {
      setLoading(false);
    }
  }, [loadDashboard]);

  // ==========================================
  // FIRST LOAD
  // ==========================================

  useEffect(() => {
    load();
  }, [load]);

  // ==========================================
  // REALTIME
  // ==========================================

  useEffect(() => {
    const sb = supabaseBrowser();

    const channel = sb
      .channel("dashboard-live")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales",
        },
        async () => {
          console.log(
            "SALE CHANGED -> REFRESH"
          );

          const p =
            await getCurrentProfile();

          if (p) {
            setProfile(p);
            await loadDashboard(p);
          }
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
        },
        async () => {
          console.log(
            "PRODUCT CHANGED -> REFRESH"
          );

          const p =
            await getCurrentProfile();

          if (p) {
            setProfile(p);
            await loadDashboard(p);
          }
        }
      )

      .subscribe((status: string) => {
        console.log(
          "Dashboard realtime:",
          status
        );
      });

    return () => {
      sb.removeChannel(channel);
    };
  }, [loadDashboard]);

  // ==========================================
  // ROLE
  // ==========================================

  const role = String(
    profile?.role || ""
  )
    .trim()
    .toUpperCase();

  const management =
    role === "CEO" ||
    role === "ADMIN";

  // ==========================================
  // PAGE
  // ==========================================

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
      ) : (
        <>
          {management ? (
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
                  value={dashboard.transactions}
                  money={false}
                />

                <Metric
                  title="Items Sold"
                  value={dashboard.items_sold}
                  money={false}
                />

                <Metric
                  title="Low Stock"
                  value={dashboard.low_stock}
                  money={false}
                />

                <Metric
                  title="Products"
                  value={dashboard.products}
                  money={false}
                />
              </div>

              <div className="notice">
                All financial and stock numbers
                are calculated from the central
                PostgreSQL database.
              </div>
            </>
          ) : (
            <>
              <div className="cards">
                <Metric
                  title="Today's Sales"
                  value={mine.day_revenue}
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
                  value={mine.day_items}
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
                  value={mine.week_items}
                  money={false}
                />

                <Metric
                  title="Year Sales"
                  value={
                    mine.year_revenue
                  }
                />

                <Metric
                  title="Year Items"
                  value={mine.year_items}
                  money={false}
                />
              </div>

              <div className="notice">
                You can record sales from POS
                and see your own performance
                here. Product prices and business
                settings are controlled by
                management.
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}

// ==========================================
// METRIC
// ==========================================

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