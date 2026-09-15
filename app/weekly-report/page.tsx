"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  supabaseBrowser,
} from "@/lib/supabase-browser";

import {
  getCurrentProfile,
} from "@/lib/current-user";

export default function WeeklyReportPage() {
  const router = useRouter();

  const [authorized, setAuthorized] =
    useState(false);

  const [checking, setChecking] =
    useState(true);

  const [excelBusy, setExcelBusy] =
    useState(false);

  const [emailBusy, setEmailBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  // ====================================================
  // CHECK LOGIN + ROLE
  // ====================================================

  useEffect(() => {
    let alive = true;

    async function checkAccess() {
      try {
        const profile =
          await getCurrentProfile();

        if (!alive) {
          return;
        }

        if (!profile) {
          router.replace("/login");
          return;
        }

        if (
          profile.role !== "CEO" &&
          profile.role !== "ADMIN"
        ) {
          router.replace("/dashboard");
          return;
        }

        setAuthorized(true);
      } catch (error) {
        console.error(
          "Weekly report access error:",
          error
        );

        if (alive) {
          router.replace("/dashboard");
        }
      } finally {
        if (alive) {
          setChecking(false);
        }
      }
    }

    checkAccess();

    return () => {
      alive = false;
    };
  }, [router]);

  // ====================================================
  // TOKEN
  // ====================================================

  async function getAccessToken() {
    const {
      data,
    } =
      await supabaseBrowser()
        .auth.getSession();

    return (
      data.session?.access_token || ""
    );
  }

  // ====================================================
  // DOWNLOAD EXCEL
  // ====================================================

  async function downloadExcel() {
    if (excelBusy || emailBusy) {
      return;
    }

    setExcelBusy(true);
    setMessage("");

    try {
      const token =
        await getAccessToken();

      if (!token) {
        throw new Error(
          "Your login session has expired. Please log in again."
        );
      }

      const response =
        await fetch(
          "/api/reports/weekly-excel",
          {
            method: "GET",

            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (!response.ok) {
        let errorText =
          "Could not generate the Excel report.";

        try {
          const data =
            await response.json();

          errorText =
            data?.error ||
            errorText;
        } catch {
          // Keep default message
        }

        throw new Error(
          errorText
        );
      }

      const blob =
        await response.blob();

      const url =
        window.URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;

      link.download =
        "ROBA_DABO_WEEKLY_REPORT.xlsx";

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      window.URL.revokeObjectURL(
        url
      );

      setMessage(
        "✅ Excel report downloaded successfully."
      );
    } catch (error) {
      console.error(
        "Weekly Excel error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not generate the Excel report."
      );
    } finally {
      setExcelBusy(false);
    }
  }

  // ====================================================
  // SEND EMAIL
  // ====================================================

  async function sendEmail() {
    if (excelBusy || emailBusy) {
      return;
    }

    setEmailBusy(true);
    setMessage("");

    try {
      const token =
        await getAccessToken();

      if (!token) {
        throw new Error(
          "Your login session has expired. Please log in again."
        );
      }

      const response =
        await fetch(
          "/api/reports/weekly-email",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${token}`,

              "Content-Type":
                "application/json",
            },
          }
        );

      let data: any = {};

      try {
        data =
          await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Could not send the weekly report."
        );
      }

      setMessage(
        data?.email
          ? `✅ Weekly report sent successfully to ${data.email}.`
          : "✅ Weekly report sent successfully."
      );
    } catch (error) {
      console.error(
        "Weekly email error:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not send the weekly report."
      );
    } finally {
      setEmailBusy(false);
    }
  }

  // ====================================================
  // LOADING
  // ====================================================

  if (checking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background:
            "#f4f6f8",
          color: "#111827",
          padding: 40,
          fontFamily:
            "Arial, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <h2>
            Loading Roba Dabo...
          </h2>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return null;
  }

  // ====================================================
  // PAGE
  // ====================================================

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "#f4f6f8",
        color: "#111827",
        fontFamily:
          "Arial, sans-serif",
      }}
    >

      {/* =================================================
          TOP BAR
      ================================================= */}

      <header
        style={{
          background:
            "#111827",
          color: "#ffffff",
          padding:
            "18px 32px",
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "space-between",
          gap: 20,
          flexWrap:
            "wrap",
        }}
      >

        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing:
                "0.5px",
            }}
          >
            ROBA DABO
          </div>

          <div
            style={{
              opacity: 0.75,
              marginTop: 3,
            }}
          >
            Online Management
          </div>
        </div>


        <nav
          style={{
            display:
              "flex",
            gap: 8,
            flexWrap:
              "wrap",
            alignItems:
              "center",
          }}
        >

          <NavLink href="/dashboard">
            Dashboard
          </NavLink>

          <NavLink href="/communication">
            💬 Communication
          </NavLink>

          <NavLink href="/pos">
            POS
          </NavLink>

          <NavLink href="/inventory">
            Inventory
          </NavLink>

          <NavLink href="/employees">
            Employees
          </NavLink>

          <NavLink href="/reports">
            Reports
          </NavLink>

          <NavLink href="/growth">
            📈 Growth
          </NavLink>

          <NavLink href="/weekly-report">
            📊 Weekly
          </NavLink>

        </nav>

      </header>


      {/* =================================================
          PAGE CONTENT
      ================================================= */}

      <div
        style={{
          maxWidth:
            1200,
          margin:
            "0 auto",
          padding:
            "42px 24px 70px",
        }}
      >

        {/* PAGE HEADER */}

        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "flex-start",
            gap: 20,
            flexWrap:
              "wrap",
          }}
        >

          <div>

            <div
              style={{
                fontSize:
                  14,
                fontWeight:
                  700,
                color:
                  "#6b7280",
                textTransform:
                  "uppercase",
                letterSpacing:
                  "1.5px",
                marginBottom:
                  8,
              }}
            >
              Backup Center
            </div>

            <h1
              style={{
                fontSize:
                  42,
                lineHeight:
                  1.1,
                margin:
                  0,
                fontWeight:
                  800,
              }}
            >
              📊 Weekly Report
            </h1>

            <p
              style={{
                marginTop:
                  12,
                fontSize:
                  18,
                color:
                  "#64748b",
              }}
            >
              Create a complete weekly Excel
              record of your Roba Dabo business.
            </p>

          </div>


          <div
            style={{
              background:
                "#ffffff",
              border:
                "1px solid #e5e7eb",
              borderRadius:
                12,
              padding:
                "12px 18px",
              fontWeight:
                700,
              boxShadow:
                "0 5px 18px rgba(0,0,0,0.05)",
            }}
          >
            🔐 Management Only
          </div>

        </div>


        {/* MESSAGE */}

        {message && (
          <div
            style={{
              marginTop:
                24,
              padding:
                "16px 18px",
              borderRadius:
                12,
              background:
                "#fff7d6",
              border:
                "1px solid #f3df8a",
              fontWeight:
                600,
            }}
          >
            {message}
          </div>
        )}


        {/* =================================================
            ACTION CARDS
        ================================================= */}

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 22,
            marginTop:
              28,
          }}
        >

          {/* EXCEL */}

          <section
            style={{
              background:
                "#ffffff",
              border:
                "1px solid #e5e7eb",
              borderRadius:
                18,
              padding:
                28,
              boxShadow:
                "0 12px 30px rgba(0,0,0,0.06)",
            }}
          >

            <div
              style={{
                fontSize:
                  42,
              }}
            >
              💾
            </div>

            <h2
              style={{
                margin:
                  "14px 0 8px",
                fontSize:
                  26,
              }}
            >
              Excel Backup
            </h2>

            <p
              style={{
                color:
                  "#64748b",
                lineHeight:
                  1.6,
                minHeight:
                  54,
              }}
            >
              Generate the current weekly
              business report and download it
              directly to this computer.
            </p>

            <button
              type="button"
              onClick={
                downloadExcel
              }
              disabled={
                excelBusy || emailBusy
              }
              style={{
                marginTop:
                  18,
                width:
                  "100%",
                padding:
                  "14px 20px",
                border:
                  "none",
                borderRadius:
                  10,
                background:
                  excelBusy
                    ? "#9ca3af"
                    : "#111827",
                color:
                  "#ffffff",
                fontSize:
                  16,
                fontWeight:
                  700,
                cursor:
                  excelBusy || emailBusy
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {excelBusy
                ? "Generating..."
                : "⬇ Generate Excel"}
            </button>

          </section>


          {/* EMAIL */}

          <section
            style={{
              background:
                "#ffffff",
              border:
                "1px solid #e5e7eb",
              borderRadius:
                18,
              padding:
                28,
              boxShadow:
                "0 12px 30px rgba(0,0,0,0.06)",
            }}
          >

            <div
              style={{
                fontSize:
                  42,
              }}
            >
              📧
            </div>

            <h2
              style={{
                margin:
                  "14px 0 8px",
                fontSize:
                  26,
              }}
            >
              Email Backup
            </h2>

            <p
              style={{
                color:
                  "#64748b",
                lineHeight:
                  1.6,
                minHeight:
                  54,
              }}
            >
              Generate and send the weekly
              Excel report to the manager's
              configured business email.
            </p>

            <button
              type="button"
              onClick={
                sendEmail
              }
              disabled={
                excelBusy || emailBusy
              }
              style={{
                marginTop:
                  18,
                width:
                  "100%",
                padding:
                  "14px 20px",
                border:
                  "none",
                borderRadius:
                  10,
                background:
                  emailBusy
                    ? "#9ca3af"
                    : "#2563eb",
                color:
                  "#ffffff",
                fontSize:
                  16,
                fontWeight:
                  700,
                cursor:
                  excelBusy || emailBusy
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {emailBusy
                ? "Sending..."
                : "📤 Send Weekly Report"}
            </button>

          </section>

        </div>


        {/* =================================================
            WHAT IS INCLUDED
        ================================================= */}

        <section
          style={{
            marginTop:
              28,
            background:
              "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius:
              18,
            padding:
              28,
            boxShadow:
              "0 12px 30px rgba(0,0,0,0.05)",
          }}
        >

          <h2
            style={{
              marginTop:
                0,
              fontSize:
                28,
            }}
          >
            📦 What's inside the backup?
          </h2>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap:
                14,
              marginTop:
                20,
            }}
          >

            <InfoCard
              icon="📊"
              title="Weekly Summary"
              text="Revenue, gross profit, expenses, net profit, transactions and items."
            />

            <InfoCard
              icon="💰"
              title="Sales"
              text="Sales transactions, employees, products, quantities, prices and profit."
            />

            <InfoCard
              icon="👥"
              title="Employees"
              text="Employee transactions, items sold, revenue and profit."
            />

            <InfoCard
              icon="📦"
              title="Inventory"
              text="Products, stock levels, prices and low-stock status."
            />

            <InfoCard
              icon="💸"
              title="Expenses"
              text="Weekly expenses, categories, descriptions and amounts."
            />

            <InfoCard
              icon="💳"
              title="Payments"
              text="Revenue grouped by payment method."
            />

            <InfoCard
              icon="📈"
              title="Growth"
              text="Current-week performance compared with the previous week."
            />

          </div>

        </section>


        {/* =================================================
            SAFETY NOTICE
        ================================================= */}

        <div
          style={{
            marginTop:
              22,
            padding:
              "16px 18px",
            borderRadius:
              12,
            background:
              "#fff7d6",
            border:
              "1px solid #f3df8a",
            color:
              "#5b4a00",
            lineHeight:
              1.6,
          }}
        >
          ⚠️ This Excel report is an independent
          business-record backup. Keep downloaded
          reports somewhere safe outside the website.
          It is not a complete PostgreSQL database
          backup.
        </div>

      </div>

    </main>
  );
}


// ======================================================
// NAV LINK
// ======================================================

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        textDecoration:
          "none",
        color:
          "#111827",
        background:
          "#f3f4f6",
        padding:
          "10px 14px",
        borderRadius:
          9,
        fontWeight:
          600,
        fontSize:
          14,
      }}
    >
      {children}
    </Link>
  );
}


// ======================================================
// INFO CARD
// ======================================================

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div
      style={{
        border:
          "1px solid #e5e7eb",
        borderRadius:
          12,
        padding:
          18,
      }}
    >
      <div
        style={{
          fontSize:
            28,
        }}
      >
        {icon}
      </div>

      <h3
        style={{
          margin:
            "8px 0 6px",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin:
            0,
          color:
            "#64748b",
          lineHeight:
            1.5,
          fontSize:
            14,
        }}
      >
        {text}
      </p>
    </div>
  );
}