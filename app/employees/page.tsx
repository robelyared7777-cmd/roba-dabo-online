"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import Shell from "@/components/Shell";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentProfile } from "@/lib/current-user";


// ======================================================
// TYPES
// ======================================================

type Employee = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  employee_code: string;
  role: "CEO" | "ADMIN" | "EMPLOYEE";
  active: boolean;
  created_at: string;
  updated_at?: string;
};

type Product = {
  id: string;
  name: string;
  category: string;
};

type Sale = {
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

type Form = {
  full_name: string;
  email: string;
  phone: string;
  employee_code: string;
  password: string;
  role: "EMPLOYEE" | "ADMIN";
};

const blank: Form = {
  full_name: "",
  email: "",
  phone: "",
  employee_code: "",
  password: "",
  role: "EMPLOYEE",
};


// ======================================================
// ETHIOPIA DATE
// ======================================================

function ethiopiaDateKey(
  value: Date | string
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Africa/Addis_Ababa",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(date);

  const year =
    parts.find(
      (x) =>
        x.type === "year"
    )?.value || "0000";

  const month =
    parts.find(
      (x) =>
        x.type === "month"
    )?.value || "00";

  const day =
    parts.find(
      (x) =>
        x.type === "day"
    )?.value || "00";

  return `${year}-${month}-${day}`;
}


// ======================================================
// ETHIOPIA MONTH
// ======================================================

function ethiopiaMonthKey(
  value: Date | string
) {
  return ethiopiaDateKey(
    value
  ).slice(0, 7);
}


// ======================================================
// ETHIOPIA YEAR
// ======================================================

function ethiopiaYearKey(
  value: Date | string
) {
  return ethiopiaDateKey(
    value
  ).slice(0, 4);
}


// ======================================================
// CURRENT ETHIOPIAN DATE
// ======================================================

function currentDayKey() {
  return ethiopiaDateKey(
    new Date()
  );
}

function currentMonthKey() {
  return currentDayKey().slice(
    0,
    7
  );
}

function currentYearKey() {
  return currentDayKey().slice(
    0,
    4
  );
}


// ======================================================
// CURRENT WEEK
// Monday -> Sunday
// ======================================================

function isThisWeek(
  value: string
) {
  const todayKey =
    currentDayKey();

  const saleKey =
    ethiopiaDateKey(value);

  const todayParts =
    todayKey
      .split("-")
      .map(Number);

  const saleParts =
    saleKey
      .split("-")
      .map(Number);

  const todayUtc =
    Date.UTC(
      todayParts[0],
      todayParts[1] - 1,
      todayParts[2]
    );

  const saleUtc =
    Date.UTC(
      saleParts[0],
      saleParts[1] - 1,
      saleParts[2]
    );

  const daysBack = Math.floor(
    (todayUtc - saleUtc) /
      (24 * 60 * 60 * 1000)
  );

  const weekday =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Africa/Addis_Ababa",
        weekday: "short",
      }
    ).format(new Date());

  const weekdayMap: Record<
    string,
    number
  > = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const todayWeekday =
    weekdayMap[weekday] ?? 1;

  const sinceMonday =
    todayWeekday === 0
      ? 6
      : todayWeekday - 1;

  return (
    daysBack >= 0 &&
    daysBack <= sinceMonday
  );
}


// ======================================================
// CALCULATE STATISTICS
// ======================================================

function calculateStats(
  sales: Sale[],
  employeeId: string
) {
  const ownSales =
    sales.filter(
      (sale) =>
        sale.employee_id ===
        employeeId
    );

  const today =
    ownSales.filter(
      (sale) =>
        ethiopiaDateKey(
          sale.sold_at
        ) === currentDayKey()
    );

  const week =
    ownSales.filter(
      (sale) =>
        isThisWeek(
          sale.sold_at
        )
    );

  const month =
    ownSales.filter(
      (sale) =>
        ethiopiaMonthKey(
          sale.sold_at
        ) === currentMonthKey()
    );

  const year =
    ownSales.filter(
      (sale) =>
        ethiopiaYearKey(
          sale.sold_at
        ) === currentYearKey()
    );


  function totals(
    list: Sale[]
  ) {
    return {
      revenue:
        list.reduce(
          (sum, sale) =>
            sum +
            Number(
              sale.total || 0
            ),
          0
        ),

      items:
        list.reduce(
          (sum, sale) =>
            sum +
            Number(
              sale.quantity || 0
            ),
          0
        ),

      transactions:
        list.length,
    };
  }


  return {
    day: totals(today),
    week: totals(week),
    month: totals(month),
    year: totals(year),
  };
}


// ======================================================
// FORMAT ETHIOPIAN TIME
// ======================================================

function formatEthiopiaDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "Africa/Addis_Ababa",

      year: "numeric",
      month: "short",
      day: "2-digit",

      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",

      hour12: true,
    }
  ).format(
    new Date(value)
  );
}


// ======================================================
// MAIN
// ======================================================

export default function Employees() {
  const router =
    useRouter();

  const [me, setMe] =
    useState<any>(null);

  const [rows, setRows] =
    useState<Employee[]>([]);

  const [sales, setSales] =
    useState<Sale[]>([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [form, setForm] =
    useState<Form>(blank);

  const [edit, setEdit] =
    useState<Employee | null>(
      null
    );

  const [editForm, setEditForm] =
    useState<Form>(blank);

  const [selected, setSelected] =
    useState<Employee | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [msg, setMsg] =
    useState("");

  const [search, setSearch] =
    useState("");


  // ====================================================
  // TOKEN
  // ====================================================

  async function token() {
    const {
      data,
    } =
      await supabaseBrowser()
        .auth.getSession();

    return (
      data.session
        ?.access_token || ""
    );
  }


  // ====================================================
  // LOAD EVERYTHING
  // ====================================================

  async function load() {
    try {
      setLoading(true);

      setMsg("");

      const p =
        await getCurrentProfile();

      setMe(p);

      if (
        !p ||
        !["CEO", "ADMIN"].includes(
          p.role
        )
      ) {
        router.replace(
          "/dashboard"
        );

        return;
      }


      // ================================================
      // LOAD EMPLOYEES
      // ================================================

      const accessToken =
        await token();

      const employeeResponse =
        await fetch(
          "/api/employees",
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          }
        );

      const employeeJson =
        await employeeResponse.json();

      if (
        !employeeResponse.ok
      ) {
        throw new Error(
          employeeJson.error ||
            "Could not load employees."
        );
      }

      setRows(
        employeeJson.employees ||
          []
      );


      // ================================================
      // LOAD SALES
      // ================================================
      //
      // IMPORTANT:
      // No nested products() query here.
      // We read sales only.
      //

      const {
        data: salesData,
        error: salesError,
      } =
        await supabaseBrowser()
          .from("sales")
          .select(
            [
              "id",
              "employee_id",
              "product_id",
              "quantity",
              "unit_price",
              "cost_at_sale",
              "total",
              "profit",
              "payment_method",
              "sold_at",
            ].join(",")
          )
          .order(
            "sold_at",
            {
              ascending:
                false,
            }
          );


      console.log(
        "EMPLOYEE PAGE SALES:",
        salesData
      );

      console.log(
        "EMPLOYEE PAGE SALES ERROR:",
        salesError
      );


      if (salesError) {
        throw salesError;
      }


      setSales(
        (salesData || []) as Sale[]
      );


      // ================================================
      // LOAD PRODUCTS SEPARATELY
      // ================================================

      const {
        data: productData,
        error: productError,
      } =
        await supabaseBrowser()
          .from("products")
          .select(
            "id,name,category"
          )
          .order(
            "name",
            {
              ascending:
                true,
            }
          );


      console.log(
        "EMPLOYEE PAGE PRODUCTS:",
        productData
      );

      console.log(
        "EMPLOYEE PAGE PRODUCTS ERROR:",
        productError
      );


      if (productError) {
        console.warn(
          "Product names could not be loaded:",
          productError
        );
      }


      setProducts(
        (productData || []) as Product[]
      );


      console.log(
        "EMPLOYEE PAGE FINAL SALES COUNT:",
        salesData?.length || 0
      );
    } catch (error) {
      console.error(
        "EMPLOYEE PAGE LOAD ERROR:",
        error
      );

      setMsg(
        error instanceof Error
          ? error.message
          : "Could not load employee page."
      );
    } finally {
      setLoading(false);
    }
  }


  // ====================================================
  // FIRST LOAD + REALTIME
  // ====================================================

  useEffect(() => {
    load();

    const sb =
      supabaseBrowser();

    const channel =
      sb
        .channel(
          "employees-live"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "profiles",
          },
          () => {
            load();
          }
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "sales",
          },
          () => {
            load();
          }
        )

        .subscribe(
          (status: string) => {
            console.log(
              "Employees realtime:",
              status
            );
          }
        );

    return () => {
      sb.removeChannel(
        channel
      );
    };
  }, []);


  // ====================================================
  // FORM
  // ====================================================

  function setF(
    key: keyof Form,
    value: string
  ) {
    setForm(
      (current) => ({
        ...current,
        [key]: value,
      })
    );
  }


  // ====================================================
  // CREATE
  // ====================================================

  async function createEmployee(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setSaving(true);
    setMsg("");

    try {
      const accessToken =
        await token();

      const response =
        await fetch(
          "/api/employees",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify(
                form
              ),
          }
        );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "Could not create account."
        );
      }

      setMsg(
        `${
          form.role ===
          "ADMIN"
            ? "Administrator"
            : "Employee"
        } created successfully.`
      );

      setForm(
        blank
      );

      await load();
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Could not create account."
      );
    } finally {
      setSaving(false);
    }
  }


  // ====================================================
  // EDIT
  // ====================================================

  function openEdit(
    employee: Employee
  ) {
    setEdit(
      employee
    );

    setEditForm({
      full_name:
        employee.full_name,

      email:
        employee.email,

      phone:
        employee.phone ||
        "",

      employee_code:
        employee.employee_code ||
        "",

      password:
        "",

      role:
        employee.role ===
        "ADMIN"
          ? "ADMIN"
          : "EMPLOYEE",
    });
  }


  async function saveEdit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    if (!edit) {
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const accessToken =
        await token();

      const response =
        await fetch(
          "/api/employees",
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify({
                ...editForm,
                id: edit.id,
              }),
          }
        );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "Could not update account."
        );
      }

      setMsg(
        "Account updated successfully."
      );

      setEdit(null);

      await load();
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Could not update account."
      );
    } finally {
      setSaving(false);
    }
  }


  // ====================================================
  // ENABLE / DISABLE
  // ====================================================

  async function toggle(
    employee: Employee
  ) {
    if (
      employee.role ===
        "ADMIN" &&
      me?.role !==
        "CEO"
    ) {
      alert(
        "Only the CEO can manage an Administrator account."
      );

      return;
    }

    if (
      !confirm(
        `${
          employee.active
            ? "Disable"
            : "Enable"
        } ${employee.full_name}?`
      )
    ) {
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const accessToken =
        await token();

      const response =
        await fetch(
          "/api/employees",
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify({
                id: employee.id,
                active:
                  !employee.active,
              }),
          }
        );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "Could not change account status."
        );
      }

      setMsg(
        `${employee.full_name} is now ${
          !employee.active
            ? "active"
            : "disabled"
        }.`
      );

      await load();
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Could not change account status."
      );
    } finally {
      setSaving(false);
    }
  }


  // ====================================================
  // DELETE
  // ====================================================

  async function remove(
    employee: Employee
  ) {
    if (
      employee.role ===
        "ADMIN" &&
      me?.role !==
        "CEO"
    ) {
      alert(
        "Only the CEO can delete an Administrator."
      );

      return;
    }

    if (
      !confirm(
        `Permanently delete ${employee.full_name}?\n\nIf this account has sales, the system will protect the sales history and ask you to disable the account instead.`
      )
    ) {
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const accessToken =
        await token();

      const response =
        await fetch(
          "/api/employees",
          {
            method: "DELETE",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify({
                id: employee.id,
              }),
          }
        );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "Could not delete account."
        );
      }

      setMsg(
        `${employee.full_name} was deleted.`
      );

      await load();
    } catch (error) {
      setMsg(
        error instanceof Error
          ? error.message
          : "Could not delete account."
      );
    } finally {
      setSaving(false);
    }
  }


  // ====================================================
  // SEARCH
  // ====================================================

  const filtered =
    useMemo(
      () =>
        rows.filter(
          (employee) =>
            `${employee.full_name} ${employee.email} ${employee.employee_code} ${employee.phone}`
              .toLowerCase()
              .includes(
                search.toLowerCase()
              )
        ),
      [
        rows,
        search,
      ]
    );


  // ====================================================
  // SELECTED EMPLOYEE SALES
  // ====================================================

  const detail =
    selected
      ? sales.filter(
          (sale) =>
            sale.employee_id ===
            selected.id
        )
      : [];


  // ====================================================
  // SELECTED TOTALS
  // ====================================================

  const detailTotals =
    detail.reduce(
      (
        result,
        sale
      ) => ({
        revenue:
          result.revenue +
          Number(
            sale.total || 0
          ),

        profit:
          result.profit +
          Number(
            sale.profit || 0
          ),

        items:
          result.items +
          Number(
            sale.quantity || 0
          ),

        transactions:
          result.transactions +
          1,
      }),
      {
        revenue: 0,
        profit: 0,
        items: 0,
        transactions: 0,
      }
    );


  // ====================================================
  // PRODUCT MAP
  // ====================================================

  function productName(
    productId: string
  ) {
    return (
      products.find(
        (product) =>
          product.id ===
          productId
      )?.name ||
      "Product"
    );
  }


  // ====================================================
  // PAGE
  // ====================================================

  return (
    <Shell>

      <div className="pagehead">

        <div>

          <h1>
            Employee Management
          </h1>

          <p className="muted">
            Create accounts, manage
            access, and monitor
            employee sales.
          </p>

        </div>

        <div className="rolebadge">
          {me?.role}
        </div>

      </div>


      {msg && (
        <div className="notice">
          {msg}
        </div>
      )}


      {/* =================================================
          CREATE ACCOUNT
      ================================================= */}

      <section className="card">

        <h2>
          Add Employee / Administrator
        </h2>

        <form
          className="form grid-form"
          onSubmit={
            createEmployee
          }
        >

          <input
            className="input"
            placeholder="Full name *"
            value={
              form.full_name
            }
            onChange={(e) =>
              setF(
                "full_name",
                e.target.value
              )
            }
            required
          />

          <input
            className="input"
            type="email"
            placeholder="Email *"
            value={
              form.email
            }
            onChange={(e) =>
              setF(
                "email",
                e.target.value
              )
            }
            required
          />

          <input
            className="input"
            placeholder="Phone"
            value={
              form.phone
            }
            onChange={(e) =>
              setF(
                "phone",
                e.target.value
              )
            }
          />

          <input
            className="input"
            placeholder="Employee ID"
            value={
              form.employee_code
            }
            onChange={(e) =>
              setF(
                "employee_code",
                e.target.value
              )
            }
          />

          <input
            className="input"
            type="password"
            minLength={8}
            placeholder="Temporary password (8+ chars) *"
            value={
              form.password
            }
            onChange={(e) =>
              setF(
                "password",
                e.target.value
              )
            }
            required
          />

          <select
            className="select"
            value={
              form.role
            }
            onChange={(e) =>
              setF(
                "role",
                e.target.value as
                  Form["role"]
              )
            }
            disabled={
              me?.role !==
              "CEO"
            }
          >

            <option value="EMPLOYEE">
              Employee
            </option>

            <option value="ADMIN">
              Administrator
            </option>

          </select>


          <button
            className="btn primary"
            disabled={
              saving
            }
          >
            {
              saving
                ? "Saving..."
                : "Create Account"
            }
          </button>

        </form>

        <p className="muted small">
          CEO can create Employees
          and Administrators.
          ADMIN can create Employees
          only.
        </p>

      </section>


      {/* =================================================
          STAFF TABLE
      ================================================= */}

      <section
        className="card"
        style={{
          marginTop: 16,
        }}
      >

        <div className="tablehead">

          <div>

            <h2>
              Staff Accounts
            </h2>

            <p className="muted small">
              Today's and monthly
              sales are calculated
              using Ethiopia time.
            </p>

          </div>

          <input
            className="input search"
            placeholder="Search name, email or ID"
            value={
              search
            }
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
          />

        </div>


        {loading ? (
          <p>
            Loading employees...
          </p>
        ) : (
          <div className="tablewrap">

            <table>

              <thead>

                <tr>

                  <th>
                    Employee
                  </th>

                  <th>
                    Contact
                  </th>

                  <th>
                    Role
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Today
                  </th>

                  <th>
                    This Month
                  </th>

                  <th>
                    Actions
                  </th>

                </tr>

              </thead>


              <tbody>

                {filtered.map(
                  (employee) => {

                    const s =
                      calculateStats(
                        sales,
                        employee.id
                      );

                    const canManage =
                      me?.role ===
                        "CEO" ||
                      employee.role !==
                        "ADMIN";

                    return (
                      <tr
                        key={
                          employee.id
                        }
                      >

                        <td>

                          <button
                            className="linkbtn"
                            onClick={() =>
                              setSelected(
                                employee
                              )
                            }
                          >

                            <b>
                              {
                                employee.full_name ||
                                "Unnamed"
                              }
                            </b>

                          </button>

                          <div className="muted small">
                            {
                              employee.employee_code ||
                              "No ID"
                            }
                          </div>

                        </td>


                        <td>

                          {
                            employee.email
                          }

                          <div className="muted small">
                            {
                              employee.phone ||
                              "No phone"
                            }
                          </div>

                        </td>


                        <td>

                          <span className="tag">
                            {
                              employee.role
                            }
                          </span>

                        </td>


                        <td>

                          <span
                            className={
                              employee.active
                                ? "status active"
                                : "status inactive"
                            }
                          >
                            {
                              employee.active
                                ? "Active"
                                : "Disabled"
                            }
                          </span>

                        </td>


                        {/* TODAY */}

                        <td>

                          {
                            s.day.revenue.toFixed(
                              2
                            )
                          }{" "}
                          Birr

                          <div className="muted small">
                            {
                              s.day.transactions
                            }{" "}
                            sales •{" "}
                            {
                              s.day.items
                            }{" "}
                            items
                          </div>

                        </td>


                        {/* MONTH */}

                        <td>

                          {
                            s.month.revenue.toFixed(
                              2
                            )
                          }{" "}
                          Birr

                          <div className="muted small">
                            {
                              s.month.transactions
                            }{" "}
                            sales •{" "}
                            {
                              s.month.items
                            }{" "}
                            transactions
                          </div>

                        </td>


                        {/* ACTIONS */}

                        <td>

                          {
                            employee.role !==
                              "CEO" &&
                            canManage ? (
                              <>

                                <button
                                  className="btn"
                                  onClick={() =>
                                    openEdit(
                                      employee
                                    )
                                  }
                                >
                                  Edit
                                </button>

                                {" "}

                                <button
                                  className={
                                    employee.active
                                      ? "btn danger"
                                      : "btn success"
                                  }
                                  onClick={() =>
                                    toggle(
                                      employee
                                    )
                                  }
                                  disabled={
                                    saving
                                  }
                                >
                                  {
                                    employee.active
                                      ? "Disable"
                                      : "Enable"
                                  }
                                </button>

                                {" "}

                                <button
                                  className="btn danger"
                                  onClick={() =>
                                    remove(
                                      employee
                                    )
                                  }
                                  disabled={
                                    saving
                                  }
                                >
                                  Delete
                                </button>

                              </>
                            ) : (
                              <span className="muted small">
                                CEO protected
                              </span>
                            )
                          }

                        </td>

                      </tr>
                    );
                  }
                )}

              </tbody>

            </table>


            {filtered.length ===
              0 && (
              <p className="muted">
                No employees found.
              </p>
            )}

          </div>
        )}

      </section>


      {/* =================================================
          EDIT MODAL
      ================================================= */}

      {edit && (
        <div className="modalback">

          <div className="modal">

            <div className="tablehead">

              <h2>
                Edit Account
              </h2>

              <button
                className="btn"
                onClick={() =>
                  setEdit(null)
                }
              >
                ✕
              </button>

            </div>


            <form
              className="form"
              onSubmit={
                saveEdit
              }
            >

              <label>
                Full name

                <input
                  className="input"
                  value={
                    editForm.full_name
                  }
                  onChange={(e) =>
                    setEditForm(
                      (x) => ({
                        ...x,
                        full_name:
                          e.target.value,
                      })
                    )
                  }
                  required
                />

              </label>


              <label>
                Email

                <input
                  className="input"
                  type="email"
                  value={
                    editForm.email
                  }
                  onChange={(e) =>
                    setEditForm(
                      (x) => ({
                        ...x,
                        email:
                          e.target.value,
                      })
                    )
                  }
                  required
                />

              </label>


              <label>
                Phone

                <input
                  className="input"
                  value={
                    editForm.phone
                  }
                  onChange={(e) =>
                    setEditForm(
                      (x) => ({
                        ...x,
                        phone:
                          e.target.value,
                      })
                    )
                  }
                />

              </label>


              <label>
                Employee ID

                <input
                  className="input"
                  value={
                    editForm.employee_code
                  }
                  onChange={(e) =>
                    setEditForm(
                      (x) => ({
                        ...x,
                        employee_code:
                          e.target.value,
                      })
                    )
                  }
                />

              </label>


              <label>
                Role

                <select
                  className="select"
                  value={
                    editForm.role
                  }
                  onChange={(e) =>
                    setEditForm(
                      (x) => ({
                        ...x,
                        role:
                          e.target.value as
                            Form["role"],
                      })
                    )
                  }
                  disabled={
                    me?.role !==
                    "CEO"
                  }
                >

                  <option value="EMPLOYEE">
                    Employee
                  </option>

                  <option value="ADMIN">
                    Administrator
                  </option>

                </select>

              </label>


              <label>
                New password
                (optional)

                <input
                  className="input"
                  type="password"
                  minLength={8}
                  placeholder="Leave blank to keep current"
                  value={
                    editForm.password
                  }
                  onChange={(e) =>
                    setEditForm(
                      (x) => ({
                        ...x,
                        password:
                          e.target.value,
                      })
                    )
                  }
                />

              </label>


              <div className="form">

                <button
                  className="btn primary"
                  disabled={
                    saving
                  }
                >
                  {
                    saving
                      ? "Saving..."
                      : "Save Changes"
                  }
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setEdit(null)
                  }
                >
                  Cancel
                </button>

              </div>

            </form>

          </div>

        </div>
      )}


      {/* =================================================
          SALES PROFILE
      ================================================= */}

      {selected && (
        <div className="modalback">

          <div className="modal wide">

            <div className="tablehead">

              <div>

                <h2>
                  {
                    selected.full_name
                  }
                </h2>

                <p className="muted">

                  {
                    selected.employee_code ||
                    "No employee ID"
                  }

                  {" • "}

                  {
                    selected.role
                  }

                  {" • "}

                  {
                    selected.active
                      ? "Active"
                      : "Disabled"
                  }

                </p>

              </div>


              <button
                className="btn"
                onClick={() =>
                  setSelected(
                    null
                  )
                }
              >
                ✕
              </button>

            </div>


            {/* TOTALS */}

            <div className="cards">

              <div className="card">

                <div>
                  Total Transactions
                </div>

                <div className="metric">
                  {
                    detailTotals.transactions
                  }
                </div>

              </div>


              <div className="card">

                <div>
                  Items Sold
                </div>

                <div className="metric">
                  {
                    detailTotals.items
                  }
                </div>

              </div>


              <div className="card">

                <div>
                  Total Sales
                </div>

                <div className="metric">

                  {
                    detailTotals.revenue.toFixed(
                      2
                    )
                  }{" "}
                  Birr

                </div>

              </div>


              <div className="card">

                <div>
                  Gross Profit
                </div>

                <div className="metric">

                  {
                    detailTotals.profit.toFixed(
                      2
                    )
                  }{" "}
                  Birr

                </div>

              </div>

            </div>


            <h3
              style={{
                marginTop: 20,
              }}
            >
              Complete Sales History
            </h3>


            {detail.length ===
            0 ? (
              <p className="muted">
                No sales recorded
                for this employee
                yet.
              </p>
            ) : (
              <div className="tablewrap">

                <table>

                  <thead>

                    <tr>

                      <th>
                        Date & Time
                      </th>

                      <th>
                        Product
                      </th>

                      <th>
                        Qty
                      </th>

                      <th>
                        Unit Price
                      </th>

                      <th>
                        Total
                      </th>

                      <th>
                        Profit
                      </th>

                      <th>
                        Payment
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {detail.map(
                      (sale) => (
                        <tr
                          key={
                            sale.id
                          }
                        >

                          <td>
                            {
                              formatEthiopiaDate(
                                sale.sold_at
                              )
                            }
                          </td>

                          <td>
                            {
                              productName(
                                sale.product_id
                              )
                            }
                          </td>

                          <td>
                            {
                              sale.quantity
                            }
                          </td>

                          <td>
                            {
                              Number(
                                sale.unit_price
                              ).toFixed(
                                2
                              )
                            }{" "}
                            Birr
                          </td>

                          <td>
                            {
                              Number(
                                sale.total
                              ).toFixed(
                                2
                              )
                            }{" "}
                            Birr
                          </td>

                          <td>
                            {
                              Number(
                                sale.profit
                              ).toFixed(
                                2
                              )
                            }{" "}
                            Birr
                          </td>

                          <td>
                            {
                              sale.payment_method
                            }
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </div>

        </div>
      )}

    </Shell>
  );
}