import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/server-admin";

type SaleRow = {
  id: string;
  employee_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  cost_at_sale: number;
  total: number;
  profit: number;
  payment_method: string;
  sold_at: string;
};

type ExpenseRow = {
  id: string;
  description: string;
  amount: number;
  category: string;
  created_by: string;
  spent_at: string;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  employee_code: string;
  role: string;
  active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  category: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
  low_stock_level: number;
  active: boolean;
};

type BusinessSettings = {
  shop_name: string;
  owner: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
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

function ethiopiaDayStart(value: Date | string) {
  const parts = ethiopiaParts(value);
  return new Date(
    `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T00:00:00+03:00`
  );
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86400000);
}

function mondayStart(date = new Date()) {
  const dayStart = ethiopiaDayStart(date);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    weekday: "short",
  }).format(dayStart);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const current = map[weekday] ?? 1;
  const daysSinceMonday = current === 0 ? 6 : current - 1;
  return addDays(dayStart, -daysSinceMonday);
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function dateOnly(value: Date | string) {
  const p = ethiopiaParts(value);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function money(value: number) {
  return Number(value || 0);
}

function pctChange(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function sum<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + money(pick(row)), 0);
}

export type WeeklyReportOptions = {
  currentWeek?: boolean;
};

export async function collectWeeklyReport(
  options: WeeklyReportOptions = {}
) {
  const sb = supabaseAdmin();

  const currentWeek = options.currentWeek !== false;
  const thisWeekStart = mondayStart();
  const start = currentWeek
    ? thisWeekStart
    : addDays(thisWeekStart, -7);
  const end = currentWeek
    ? new Date()
    : thisWeekStart;

  const previousStart = addDays(start, -7);
  const previousEnd = start;

  const [
    salesResult,
    previousSalesResult,
    expensesResult,
    previousExpensesResult,
    employeesResult,
    productsResult,
    settingsResult,
  ] = await Promise.all([
    sb
      .from("sales")
      .select(
        "id,employee_id,product_id,quantity,unit_price,cost_at_sale,total,profit,payment_method,sold_at"
      )
      .gte("sold_at", start.toISOString())
      .lt("sold_at", end.toISOString())
      .order("sold_at", { ascending: false }),

    sb
      .from("sales")
      .select("id,quantity,total,profit,sold_at")
      .gte("sold_at", previousStart.toISOString())
      .lt("sold_at", previousEnd.toISOString()),

    sb
      .from("expenses")
      .select("id,description,amount,category,created_by,spent_at")
      .gte("spent_at", start.toISOString())
      .lt("spent_at", end.toISOString())
      .order("spent_at", { ascending: false }),

    sb
      .from("expenses")
      .select("id,amount,spent_at")
      .gte("spent_at", previousStart.toISOString())
      .lt("spent_at", previousEnd.toISOString()),

    sb
      .from("profiles")
      .select("id,full_name,email,phone,employee_code,role,active")
      .order("full_name", { ascending: true }),

    sb
      .from("products")
      .select("id,name,category,cost_price,sale_price,quantity,low_stock_level,active")
      .order("name", { ascending: true }),

    sb
      .from("business_settings")
      .select("shop_name,owner,email,phone,address,currency")
      .eq("id", 1)
      .single(),
  ]);

  const firstError = [
    salesResult.error,
    previousSalesResult.error,
    expensesResult.error,
    previousExpensesResult.error,
    employeesResult.error,
    productsResult.error,
    settingsResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  const sales = (salesResult.data || []) as SaleRow[];
  const previousSales = (previousSalesResult.data || []) as Array<Pick<SaleRow, "id" | "quantity" | "total" | "profit" | "sold_at">>;
  const expenses = (expensesResult.data || []) as ExpenseRow[];
  const previousExpenses = (previousExpensesResult.data || []) as Array<Pick<ExpenseRow, "id" | "amount" | "spent_at">>;
  const employees = (employeesResult.data || []) as EmployeeRow[];
  const products = (productsResult.data || []) as ProductRow[];
  const settings = (settingsResult.data || {}) as BusinessSettings;

  const revenue = sum(sales, (x) => Number(x.total));
  const grossProfit = sum(sales, (x) => Number(x.profit));
  const totalExpenses = sum(expenses, (x) => Number(x.amount));
  const netProfit = grossProfit - totalExpenses;
  const transactions = sales.length;
  const itemsSold = sum(sales, (x) => Number(x.quantity));

  const previousRevenue = sum(previousSales, (x) => Number(x.total));
  const previousGrossProfit = sum(previousSales, (x) => Number(x.profit));
  const previousExpensesTotal = sum(previousExpenses, (x) => Number(x.amount));
  const previousNetProfit = previousGrossProfit - previousExpensesTotal;
  const previousTransactions = previousSales.length;
  const previousItems = sum(previousSales, (x) => Number(x.quantity));

  const employeeMap = new Map(
    employees.map((employee) => [employee.id, employee])
  );

  const productMap = new Map(
    products.map((product) => [product.id, product])
  );

  const employeeStats = new Map<
    string,
    { revenue: number; profit: number; items: number; transactions: number }
  >();

  const productStats = new Map<
    string,
    { revenue: number; profit: number; items: number; transactions: number }
  >();

  const paymentStats = new Map<string, number>();

  for (const sale of sales) {
    const employee = employeeStats.get(sale.employee_id) || {
      revenue: 0,
      profit: 0,
      items: 0,
      transactions: 0,
    };
    employee.revenue += Number(sale.total || 0);
    employee.profit += Number(sale.profit || 0);
    employee.items += Number(sale.quantity || 0);
    employee.transactions += 1;
    employeeStats.set(sale.employee_id, employee);

    const product = productStats.get(sale.product_id) || {
      revenue: 0,
      profit: 0,
      items: 0,
      transactions: 0,
    };
    product.revenue += Number(sale.total || 0);
    product.profit += Number(sale.profit || 0);
    product.items += Number(sale.quantity || 0);
    product.transactions += 1;
    productStats.set(sale.product_id, product);

    const payment = sale.payment_method || "Cash";
    paymentStats.set(
      payment,
      (paymentStats.get(payment) || 0) + Number(sale.total || 0)
    );
  }

  const employeeSheet = employees
    .filter((employee) => employee.role !== "CEO")
    .map((employee) => {
      const stats = employeeStats.get(employee.id) || {
        revenue: 0,
        profit: 0,
        items: 0,
        transactions: 0,
      };
      return {
        Employee: employee.full_name || "Unnamed",
        "Employee ID": employee.employee_code || "",
        Role: employee.role,
        Status: employee.active ? "Active" : "Disabled",
        Email: employee.email || "",
        Phone: employee.phone || "",
        Transactions: stats.transactions,
        "Items Sold": stats.items,
        Revenue: stats.revenue,
        Profit: stats.profit,
      };
    })
    .sort((a, b) => b.Revenue - a.Revenue);

  const productSheet = products.map((product) => {
    const stats = productStats.get(product.id) || {
      revenue: 0,
      profit: 0,
      items: 0,
      transactions: 0,
    };
    return {
      Product: product.name,
      Category: product.category,
      Active: product.active ? "Yes" : "No",
      Stock: product.quantity,
      "Low Stock Level": product.low_stock_level,
      "Cost Price": product.cost_price,
      "Sale Price": product.sale_price,
      "Items Sold": stats.items,
      Revenue: stats.revenue,
      Profit: stats.profit,
      "Stock Status": !product.active
        ? "Inactive"
        : product.quantity <= product.low_stock_level
          ? "LOW STOCK"
          : "OK",
    };
  });

  const salesSheet = sales.map((sale) => ({
    "Date & Time": formatDate(sale.sold_at),
    Date: dateOnly(sale.sold_at),
    Employee:
      employeeMap.get(sale.employee_id)?.full_name || "Unknown",
    "Employee ID":
      employeeMap.get(sale.employee_id)?.employee_code || "",
    Product:
      productMap.get(sale.product_id)?.name || "Unknown",
    Category:
      productMap.get(sale.product_id)?.category || "",
    Quantity: Number(sale.quantity || 0),
    "Unit Price": Number(sale.unit_price || 0),
    Total: Number(sale.total || 0),
    Profit: Number(sale.profit || 0),
    Payment: sale.payment_method || "Cash",
  }));

  const expensesSheet = expenses.map((expense) => ({
    "Date & Time": formatDate(expense.spent_at),
    Date: dateOnly(expense.spent_at),
    Category: expense.category,
    Description: expense.description,
    Amount: Number(expense.amount || 0),
    "Created By":
      employeeMap.get(expense.created_by)?.full_name || "Management",
  }));

  const paymentSheet = [...paymentStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([method, amount]) => ({
      "Payment Method": method,
      Revenue: amount,
      Share: revenue ? amount / revenue : 0,
    }));

  const summarySheet = [
    [settings.shop_name || "Roba Dabo", "Weekly Business Report"],
    ["Owner", settings.owner || ""],
    ["Manager Email", settings.email || ""],
    ["Period Start", formatDate(start)],
    ["Period End", formatDate(end)],
    [],
    ["Metric", "Current Week", "Previous Week", "Growth"],
    ["Revenue", revenue, previousRevenue, pctChange(revenue, previousRevenue) / 100],
    ["Gross Profit", grossProfit, previousGrossProfit, pctChange(grossProfit, previousGrossProfit) / 100],
    ["Expenses", totalExpenses, previousExpensesTotal, pctChange(totalExpenses, previousExpensesTotal) / 100],
    ["Net Profit", netProfit, previousNetProfit, pctChange(netProfit, previousNetProfit) / 100],
    ["Transactions", transactions, previousTransactions, pctChange(transactions, previousTransactions) / 100],
    ["Items Sold", itemsSold, previousItems, pctChange(itemsSold, previousItems) / 100],
    [],
    ["Low Stock Products", products.filter((p) => p.active && p.quantity <= p.low_stock_level).length],
    ["Active Products", products.filter((p) => p.active).length],
    ["Total Products", products.length],
  ];

  const growthSheet = [
    ["Metric", "Current", "Previous", "Growth"],
    ["Revenue", revenue, previousRevenue, pctChange(revenue, previousRevenue) / 100],
    ["Gross Profit", grossProfit, previousGrossProfit, pctChange(grossProfit, previousGrossProfit) / 100],
    ["Expenses", totalExpenses, previousExpensesTotal, pctChange(totalExpenses, previousExpensesTotal) / 100],
    ["Net Profit", netProfit, previousNetProfit, pctChange(netProfit, previousNetProfit) / 100],
    ["Transactions", transactions, previousTransactions, pctChange(transactions, previousTransactions) / 100],
    ["Items Sold", itemsSold, previousItems, pctChange(itemsSold, previousItems) / 100],
  ];

  return {
    start,
    end,
    settings,
    summary: {
      revenue,
      grossProfit,
      totalExpenses,
      netProfit,
      transactions,
      itemsSold,
      previousRevenue,
      previousGrossProfit,
      previousExpenses: previousExpensesTotal,
      previousNetProfit,
      previousTransactions,
      previousItems,
    },
    sheets: {
      summary: summarySheet,
      sales: salesSheet,
      employees: employeeSheet,
      products: productSheet,
      expenses: expensesSheet,
      payments: paymentSheet,
      growth: growthSheet,
    },
  };
}

function applyWidths(sheet: XLSX.WorkSheet, widths: number[]) {
  sheet["!cols"] = widths.map((wch) => ({ wch }));
}

export async function buildWeeklyWorkbook(options: WeeklyReportOptions = {}) {
  const report = await collectWeeklyReport(options);
  const workbook = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet(report.sheets.summary);
  const sales = XLSX.utils.json_to_sheet(report.sheets.sales);
  const employees = XLSX.utils.json_to_sheet(report.sheets.employees);
  const products = XLSX.utils.json_to_sheet(report.sheets.products);
  const expenses = XLSX.utils.json_to_sheet(report.sheets.expenses);
  const payments = XLSX.utils.json_to_sheet(report.sheets.payments);
  const growth = XLSX.utils.aoa_to_sheet(report.sheets.growth);

  applyWidths(summary, [28, 20, 20, 16]);
  applyWidths(sales, [24, 13, 22, 14, 26, 16, 12, 14, 14, 14, 16]);
  applyWidths(employees, [24, 15, 14, 12, 28, 18, 14, 14, 16, 16]);
  applyWidths(products, [24, 16, 10, 12, 16, 14, 14, 14, 16, 14, 16]);
  applyWidths(expenses, [24, 13, 18, 36, 14, 24]);
  applyWidths(payments, [20, 16, 12]);
  applyWidths(growth, [22, 18, 18, 14]);

  XLSX.utils.book_append_sheet(workbook, summary, "Weekly Summary");
  XLSX.utils.book_append_sheet(workbook, sales, "Sales");
  XLSX.utils.book_append_sheet(workbook, employees, "Employees");
  XLSX.utils.book_append_sheet(workbook, products, "Inventory");
  XLSX.utils.book_append_sheet(workbook, expenses, "Expenses");
  XLSX.utils.book_append_sheet(workbook, payments, "Payments");
  XLSX.utils.book_append_sheet(workbook, growth, "Growth");

  return { workbook, report };
}

export async function weeklyFilename(options: WeeklyReportOptions = {}) {
  const report = await collectWeeklyReport(options);
  const p = ethiopiaParts(report.end);
  return `ROBA_DABO_WEEKLY_REPORT_${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}.xlsx`;
}
