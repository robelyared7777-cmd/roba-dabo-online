export type Role = "CEO" | "ADMIN" | "EMPLOYEE";

export type Product = {
  id: string;
  name: string;
  category: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
  low_stock_level: number;
  active: boolean;
};

export type Dashboard = {
  revenue: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  transactions: number;
  itemsSold: number;
};