"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentProfile } from "@/lib/current-user";

type RangeKey = "1D" | "7D" | "1M" | "3M" | "6M" | "1Y" | "ALL";

type Sale = {
  id: string;
  employee_id: string;
  product_id: string;
  quantity: number;
  total: number;
  profit: number;
  payment_method: string;
  sold_at: string;
};

type Expense = {
  id: string;
  amount: number;
  category: string;
  description: string;
  spent_at: string;
};

type Product = {
  id: string;
  name: string;
  category: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
  low_stock_level: number;
  active: boolean;
};

type Employee = {
  id: string;
  full_name: string;
  employee_code: string;
  active: boolean;
};

type GrowthData = {
  sales: Sale[];
  expenses: Expense[];
  products: Product[];
  employees: Employee[];
};

const EMPTY: GrowthData = {
  sales: [],
  expenses: [],
  products: [],
  employees: [],
};

function ethiopiaParts(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function dateKey(value: Date | string) {
  const p = ethiopiaParts(value);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function monthKey(value: Date | string) {
  return dateKey(value).slice(0, 7);
}

function dayStartUtc(year: number, month: number, day: number) {
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+03:00`
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function startOfCurrentEthiopianDay() {
  const p = ethiopiaParts(new Date());
  return dayStartUtc(p.year, p.month, p.day);
}

function currentRangeStart(range: RangeKey) {
  const today = startOfCurrentEthiopianDay();

  if (range === "1D") return today;
  if (range === "7D") return addDays(today, -6);
  if (range === "1M") return addDays(today, -29);
  if (range === "3M") return addDays(today, -89);
  if (range === "6M") return addDays(today, -179);
  if (range === "1Y") return addDays(today, -364);
  return new Date(0);
}

function formatShortDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Birr`;
}

function compactNumber(value: number) {
  return Number(value || 0).toLocaleString();
}

function pct(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function sum<T>(items: T[], get: (item: T) => number) {
  return items.reduce((total, item) => total + Number(get(item) || 0), 0);
}

function groupByDay<T>(
  items: T[],
  getDate: (item: T) => string,
  getValue: (item: T) => number
) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const key = dateKey(getDate(item));
    map.set(key, (map.get(key) || 0) + Number(getValue(item) || 0));
  });
  return map;
}

function groupCountByDay<T>(items: T[], getDate: (item: T) => string) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const key = dateKey(getDate(item));
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function buildDays(range: RangeKey, sales: Sale[], expenses: Expense[]) {
  const start = currentRangeStart(range);
  const end = new Date();
  const salesInRange = sales.filter((x) => new Date(x.sold_at) >= start && new Date(x.sold_at) <= end);
  const expensesInRange = expenses.filter((x) => new Date(x.spent_at) >= start && new Date(x.spent_at) <= end);

  const revenueMap = groupByDay(salesInRange, (x) => x.sold_at, (x) => x.total);
  const profitMap = groupByDay(salesInRange, (x) => x.sold_at, (x) => x.profit);
  const expenseMap = groupByDay(expensesInRange, (x) => x.spent_at, (x) => x.amount);
  const transactionMap = groupCountByDay(salesInRange, (x) => x.sold_at);
  const itemsMap = groupByDay(salesInRange, (x) => x.sold_at, (x) => x.quantity);

  const first = ethiopiaParts(start);
  let cursor = dayStartUtc(first.year, first.month, first.day);
  const endKey = dateKey(end);
  const rows: Array<Record<string, string | number>> = [];

  while (dateKey(cursor) <= endKey) {
    const key = dateKey(cursor);
    rows.push({
      key,
      label: formatShortDate(key),
      revenue: revenueMap.get(key) || 0,
      profit: profitMap.get(key) || 0,
      expenses: expenseMap.get(key) || 0,
      net_profit: (profitMap.get(key) || 0) - (expenseMap.get(key) || 0),
      transactions: transactionMap.get(key) || 0,
      items: itemsMap.get(key) || 0,
    });
    cursor = addDays(cursor, 1);
  }

  return rows;
}

function buildAllTimeMonthly(sales: Sale[], expenses: Expense[]) {
  const monthSet = new Set<string>();
  const revenueMap = new Map<string, number>();
  const profitMap = new Map<string, number>();
  const expenseMap = new Map<string, number>();
  const transactionMap = new Map<string, number>();
  const itemsMap = new Map<string, number>();

  sales.forEach((sale) => {
    const key = monthKey(sale.sold_at);
    monthSet.add(key);
    revenueMap.set(key, (revenueMap.get(key) || 0) + Number(sale.total || 0));
    profitMap.set(key, (profitMap.get(key) || 0) + Number(sale.profit || 0));
    transactionMap.set(key, (transactionMap.get(key) || 0) + 1);
    itemsMap.set(key, (itemsMap.get(key) || 0) + Number(sale.quantity || 0));
  });

  expenses.forEach((expense) => {
    const key = monthKey(expense.spent_at);
    monthSet.add(key);
    expenseMap.set(key, (expenseMap.get(key) || 0) + Number(expense.amount || 0));
  });

  return [...monthSet].sort().map((key) => ({
    key,
    label: key,
    revenue: revenueMap.get(key) || 0,
    profit: profitMap.get(key) || 0,
    expenses: expenseMap.get(key) || 0,
    net_profit: (profitMap.get(key) || 0) - (expenseMap.get(key) || 0),
    transactions: transactionMap.get(key) || 0,
    items: itemsMap.get(key) || 0,
  }));
}

function rangeLabel(range: RangeKey) {
  if (range === "ALL") return "All history";
  if (range === "1D") return "Today";
  if (range === "7D") return "Last 7 days";
  if (range === "1M") return "Last 30 days";
  if (range === "3M") return "Last 3 months";
  if (range === "6M") return "Last 6 months";
  return "Last 12 months";
}

function MiniChart({
  data,
  dataKey,
  type = "area",
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  type?: "area" | "line" | "bar";
}) {
  return (
    <div className="growth-mini-chart">
      <ResponsiveContainer width="100%" height="100%">
        {type === "bar" ? (
          <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Bar dataKey={dataKey} fill="currentColor" radius={[3, 3, 0, 0]} />
          </BarChart>
        ) : type === "line" ? (
          <LineChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Line type="monotone" dataKey={dataKey} stroke="currentColor" strokeWidth={2.5} dot={false} />
          </LineChart>
        ) : (
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Area type="monotone" dataKey={dataKey} stroke="currentColor" fill="currentColor" fillOpacity={0.14} strokeWidth={2.5} dot={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  chartData,
  chartKey,
  chartType = "area",
}: {
  title: string;
  value: string;
  subtitle: string;
  chartData: Array<Record<string, string | number>>;
  chartKey: string;
  chartType?: "area" | "line" | "bar";
}) {
  return (
    <div className="growth-kpi-card">
      <div className="growth-kpi-head">
        <span>{title}</span>
        <span className="growth-kpi-dot">●</span>
      </div>
      <div className="growth-kpi-value">{value}</div>
      <div className="growth-kpi-subtitle">{subtitle}</div>
      <MiniChart data={chartData} dataKey={chartKey} type={chartType} />
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="growth-chart-card">
      <div className="growth-chart-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="growth-chart-body">{children}</div>
    </section>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="growth-tooltip">
      <div className="growth-tooltip-label">{label}</div>
      {payload.map((item: any) => (
        <div className="growth-tooltip-row" key={item.dataKey}>
          <span>{item.name || item.dataKey}</span>
          <b>{typeof item.value === "number" ? item.value.toLocaleString() : item.value}</b>
        </div>
      ))}
    </div>
  );
}

export default function GrowthPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RangeKey>("1M");
  const [data, setData] = useState<GrowthData>(EMPTY);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      setError("");

      const profile = await getCurrentProfile();
      const role = String(profile?.role || "").trim().toUpperCase();

      if (!profile || !["CEO", "ADMIN"].includes(role)) {
        router.replace("/dashboard");
        return;
      }

      setAllowed(true);
      const sb = supabaseBrowser();

      const [salesResult, expensesResult, productsResult, employeeResult] = await Promise.all([
        sb
          .from("sales")
          .select("id,employee_id,product_id,quantity,total,profit,payment_method,sold_at")
          .order("sold_at", { ascending: true })
          .limit(10000),
        sb
          .from("expenses")
          .select("id,amount,category,description,spent_at")
          .order("spent_at", { ascending: true })
          .limit(10000),
        sb
          .from("products")
          .select("id,name,category,cost_price,sale_price,quantity,low_stock_level,active")
          .order("name", { ascending: true }),
        sb
          .from("profiles")
          .select("id,full_name,employee_code,active")
          .order("full_name", { ascending: true }),
      ]);

      if (salesResult.error) throw salesResult.error;
      if (expensesResult.error) throw expensesResult.error;
      if (productsResult.error) throw productsResult.error;
      if (employeeResult.error) throw employeeResult.error;

      setData({
        sales: (salesResult.data || []) as Sale[],
        expenses: (expensesResult.data || []) as Expense[],
        products: (productsResult.data || []) as Product[],
        employees: (employeeResult.data || []) as Employee[],
      });
    } catch (err) {
      console.error("Growth page error:", err);
      setError(err instanceof Error ? err.message : "Could not load growth data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load(), 60000);
    return () => clearInterval(timer);
  }, [load]);

  const chartData = useMemo(() => {
    if (range === "ALL") return buildAllTimeMonthly(data.sales, data.expenses);
    return buildDays(range, data.sales, data.expenses);
  }, [data.sales, data.expenses, range]);

  const rangeSales = useMemo(() => {
    if (range === "ALL") return data.sales;
    const start = currentRangeStart(range);
    return data.sales.filter((x) => new Date(x.sold_at) >= start);
  }, [data.sales, range]);

  const rangeExpenses = useMemo(() => {
    if (range === "ALL") return data.expenses;
    const start = currentRangeStart(range);
    return data.expenses.filter((x) => new Date(x.spent_at) >= start);
  }, [data.expenses, range]);

  const revenue = sum(rangeSales, (x) => x.total);
  const grossProfit = sum(rangeSales, (x) => x.profit);
  const expenses = sum(rangeExpenses, (x) => x.amount);
  const netProfit = grossProfit - expenses;
  const transactions = rangeSales.length;
  const items = sum(rangeSales, (x) => x.quantity);
  const inventoryValue = sum(data.products.filter((x) => x.active), (x) => x.quantity * x.cost_price);
  const saleValueAtPrice = sum(data.products.filter((x) => x.active), (x) => x.quantity * x.sale_price);
  const lowStock = data.products.filter((x) => x.active && x.quantity <= x.low_stock_level).length;
  const activeProducts = data.products.filter((x) => x.active).length;

  const previousRange = useMemo(() => {
    if (range === "ALL") return null;
    const currentStart = currentRangeStart(range);
    const length = Math.max(1, Math.round((Date.now() - currentStart.getTime()) / 86400000));
    const previousStart = addDays(currentStart, -length);
    const previousEnd = new Date(currentStart.getTime() - 1);
    return { previousStart, previousEnd };
  }, [range]);

  const previousRevenue = previousRange
    ? sum(
        data.sales.filter((x) => {
          const t = new Date(x.sold_at).getTime();
          return t >= previousRange.previousStart.getTime() && t <= previousRange.previousEnd.getTime();
        }),
        (x) => x.total
      )
    : 0;

  const revenueGrowth = previousRange && previousRevenue
    ? ((revenue - previousRevenue) / previousRevenue) * 100
    : 0;

  const previousProfit = previousRange
    ? sum(
        data.sales.filter((x) => {
          const t = new Date(x.sold_at).getTime();
          return t >= previousRange.previousStart.getTime() && t <= previousRange.previousEnd.getTime();
        }),
        (x) => x.profit
      ) -
      sum(
        data.expenses.filter((x) => {
          const t = new Date(x.spent_at).getTime();
          return t >= previousRange.previousStart.getTime() && t <= previousRange.previousEnd.getTime();
        }),
        (x) => x.amount
      )
    : 0;

  const profitGrowth = previousRange && previousProfit
    ? ((netProfit - previousProfit) / Math.abs(previousProfit)) * 100
    : 0;

  const productMap = new Map<string, Product>(data.products.map((product) => [product.id, product]));
  const employeeMap = new Map<string, Employee>(data.employees.map((employee) => [employee.id, employee]));

  const productPerformance = useMemo(() => {
    const map = new Map<string, { name: string; items: number; revenue: number }>();
    rangeSales.forEach((sale) => {
      const product = productMap.get(sale.product_id);
      const name = product?.name || "Unknown product";
      const existing = map.get(sale.product_id) || { name, items: 0, revenue: 0 };
      existing.items += Number(sale.quantity || 0);
      existing.revenue += Number(sale.total || 0);
      map.set(sale.product_id, existing);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [rangeSales, data.products]);

  const employeePerformance = useMemo(() => {
    const map = new Map<string, { name: string; code: string; revenue: number; items: number; profit: number }>();
    rangeSales.forEach((sale) => {
      const employee = employeeMap.get(sale.employee_id);
      const existing = map.get(sale.employee_id) || {
        name: employee?.full_name || "Unknown employee",
        code: employee?.employee_code || "",
        revenue: 0,
        items: 0,
        profit: 0,
      };
      existing.revenue += Number(sale.total || 0);
      existing.items += Number(sale.quantity || 0);
      existing.profit += Number(sale.profit || 0);
      map.set(sale.employee_id, existing);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [rangeSales, data.employees]);

  const paymentMix = useMemo(() => {
    const map = new Map<string, number>();
    rangeSales.forEach((sale) => {
      const method = sale.payment_method || "Other";
      map.set(method, (map.get(method) || 0) + Number(sale.total || 0));
    });
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [rangeSales]);

  const inventoryHealth = useMemo(() => {
    return data.products
      .filter((x) => x.active)
      .map((product) => ({
        name: product.name,
        stock: Number(product.quantity || 0),
        low: Number(product.low_stock_level || 0),
      }))
      .sort((a, b) => a.stock - b.stock);
  }, [data.products]);

  const topEmployee = employeePerformance[0];
  const topProduct = productPerformance[0];

  const inventoryHealthScore = activeProducts
    ? Math.max(0, Math.min(100, ((activeProducts - lowStock) / activeProducts) * 100))
    : 100;

  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const volumeScore = Math.min(100, transactions * 3);
  const profitScore = Math.max(0, Math.min(100, 50 + profitGrowth));
  const growthScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        revenueGrowth * 0.3 +
          profitScore * 0.25 +
          volumeScore * 0.15 +
          inventoryHealthScore * 0.15 +
          (topEmployee ? 100 : 0) * 0.1 +
          (lowStock === 0 ? 100 : 40) * 0.05
      )
    )
  );

  const growthStatus =
    growthScore >= 80
      ? "Strong growth"
      : growthScore >= 60
        ? "Growing steadily"
        : growthScore >= 40
          ? "Needs attention"
          : "Needs action";

  if (!allowed && !loading) {
    return <Shell><p>Checking access...</p></Shell>;
  }

  return (
    <Shell>
      <div className="growth-page">
        <div className="growth-header">
          <div>
            <div className="growth-kicker">ROBA DABO • BUSINESS TERMINAL</div>
            <h1>Shop Growth</h1>
            <p>Track the business like a market chart — revenue, profit, people, products and inventory in one place.</p>
          </div>
          <div className="growth-header-actions">
            <span className="growth-live-dot">● LIVE</span>
            <button className="btn" onClick={load} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </div>

        <div className="growth-toolbar">
          <div className="growth-range-label">{rangeLabel(range)}</div>
          <div className="growth-range-tabs">
            {(["1D", "7D", "1M", "3M", "6M", "1Y", "ALL"] as RangeKey[]).map((item) => (
              <button
                key={item}
                type="button"
                className={range === item ? "growth-range active" : "growth-range"}
                onClick={() => setRange(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="notice">{error}</div>}

        {loading ? (
          <div className="growth-loading">Loading growth data...</div>
        ) : (
          <>
            <div className="growth-kpi-grid">
              <MetricCard
                title="Revenue"
                value={money(revenue)}
                subtitle={`${pct(revenueGrowth)} vs previous range`}
                chartData={chartData}
                chartKey="revenue"
              />
              <MetricCard
                title="Gross Profit"
                value={money(grossProfit)}
                subtitle={`${pct(profitGrowth)} profit trend`}
                chartData={chartData}
                chartKey="profit"
                chartType="line"
              />
              <MetricCard
                title="Expenses"
                value={money(expenses)}
                subtitle={`${pct(revenue > 0 ? (expenses / revenue) * 100 : 0)} of revenue`}
                chartData={chartData}
                chartKey="expenses"
                chartType="bar"
              />
              <MetricCard
                title="Net Profit"
                value={money(netProfit)}
                subtitle={`${pct(margin)} net margin`}
                chartData={chartData}
                chartKey="net_profit"
              />
              <MetricCard
                title="Transactions"
                value={compactNumber(transactions)}
                subtitle={`${compactNumber(items)} items sold`}
                chartData={chartData}
                chartKey="transactions"
                chartType="bar"
              />
              <MetricCard
                title="Items Sold"
                value={compactNumber(items)}
                subtitle={`${compactNumber(transactions)} sales`}
                chartData={chartData}
                chartKey="items"
              />
              <MetricCard
                title="Inventory Value"
                value={money(inventoryValue)}
                subtitle={`${money(saleValueAtPrice)} retail stock value`}
                chartData={data.products.filter((x) => x.active).map((x) => ({ key: x.id, value: x.quantity * x.cost_price }))}
                chartKey="value"
              />
              <MetricCard
                title="Low Stock"
                value={compactNumber(lowStock)}
                subtitle={`${compactNumber(activeProducts)} active products`}
                chartData={inventoryHealth.map((x) => ({ key: x.name, stock: x.stock }))}
                chartKey="stock"
                chartType="bar"
              />
            </div>

            <div className="growth-main-grid">
              <ChartCard title="Revenue Trend" subtitle="Sales revenue over the selected range">
                <ResponsiveContainer width="100%" height={330}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="label" minTickGap={24} />
                    <YAxis />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="currentColor" fill="currentColor" fillOpacity={0.12} strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Profit vs Expenses" subtitle="Separate chart for profitability and operating pressure">
                <ResponsiveContainer width="100%" height={330}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="label" minTickGap={24} />
                    <YAxis />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="profit" name="Gross Profit" stroke="currentColor" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke="currentColor" strokeWidth={2} strokeDasharray="7 5" dot={false} />
                    <Line type="monotone" dataKey="net_profit" name="Net Profit" stroke="currentColor" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Transactions Trend" subtitle="How frequently the shop is making sales">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="label" minTickGap={24} />
                    <YAxis allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="transactions" name="Transactions" fill="currentColor" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Items Sold Trend" subtitle="Unit volume across the selected range">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="label" minTickGap={24} />
                    <YAxis allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="items" name="Items" stroke="currentColor" fill="currentColor" fillOpacity={0.12} strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="growth-two-grid">
              <ChartCard title="Best-Selling Products" subtitle="Each product gets its own revenue bar">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={productPerformance} layout="vertical" margin={{ left: 15, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={120} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="revenue" name="Revenue" fill="currentColor" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Employee Performance" subtitle="Revenue, volume and contribution by employee">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={employeePerformance} margin={{ left: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="code" />
                    <YAxis />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="revenue" name="Revenue" fill="currentColor" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="profit" name="Profit" fill="currentColor" fillOpacity={0.55} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Payment Mix" subtitle="Revenue split by payment method">
                <div className="growth-pie-wrap">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={paymentMix} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={3}>
                        {paymentMix.map((entry) => (
                          <Cell key={entry.name} fill="currentColor" />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="growth-legend-list">
                    {paymentMix.map((entry) => (
                      <div key={entry.name} className="growth-legend-row">
                        <span>{entry.name}</span>
                        <b>{money(entry.value)}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>

              <ChartCard title="Inventory Health" subtitle="Current stock compared with each product's warning level">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={inventoryHealth} layout="vertical" margin={{ left: 15, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="stock" name="Stock" fill="currentColor" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="low" name="Low-stock level" fill="currentColor" fillOpacity={0.25} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <section className="growth-score-panel">
              <div className="growth-score-left">
                <div className="growth-kicker">BUSINESS MOMENTUM</div>
                <h2>Roba Dabo Growth Score</h2>
                <p>{growthStatus}. The score combines revenue growth, profit trend, sales volume, inventory health, active employee activity and low-stock risk.</p>

                <div className="growth-score-ring">
                  <div>
                    <strong>{growthScore}</strong>
                    <span>/100</span>
                  </div>
                </div>
              </div>

              <div className="growth-signal-grid">
                <div className="growth-signal-card">
                  <span>Revenue Growth</span>
                  <strong>{pct(revenueGrowth)}</strong>
                  <MiniChart data={chartData} dataKey="revenue" />
                </div>
                <div className="growth-signal-card">
                  <span>Profit Margin</span>
                  <strong>{pct(margin)}</strong>
                  <MiniChart data={chartData} dataKey="net_profit" type="line" />
                </div>
                <div className="growth-signal-card">
                  <span>Inventory Health</span>
                  <strong>{pct(inventoryHealthScore)}</strong>
                  <MiniChart data={inventoryHealth.map((x) => ({ key: x.name, stock: x.stock }))} dataKey="stock" type="bar" />
                </div>
                <div className="growth-signal-card">
                  <span>Active Products</span>
                  <strong>{compactNumber(activeProducts)}</strong>
                  <MiniChart data={data.products.filter((x) => x.active).map((x) => ({ key: x.id, stock: x.quantity }))} dataKey="stock" />
                </div>
              </div>
            </section>

            <div className="growth-insights">
              <div className="growth-insight">
                <b>📈 Revenue</b>
                <span>{money(revenue)} in {rangeLabel(range).toLowerCase()}.</span>
              </div>
              <div className="growth-insight">
                <b>🏆 Best product</b>
                <span>{topProduct ? `${topProduct.name} • ${money(topProduct.revenue)}` : "No sales yet"}</span>
              </div>
              <div className="growth-insight">
                <b>👤 Top employee</b>
                <span>{topEmployee ? `${topEmployee.name} • ${money(topEmployee.revenue)}` : "No employee sales yet"}</span>
              </div>
              <div className="growth-insight">
                <b>⚠️ Inventory</b>
                <span>{lowStock === 0 ? "No active products are below their low-stock level." : `${lowStock} active product(s) need attention.`}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
