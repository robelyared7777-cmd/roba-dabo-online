import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server-admin";
import {
  buildWeeklyWorkbook,
  weeklyFilename,
} from "@/lib/weekly-report";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length);
  const admin = supabaseAdmin();

  const { data: userData } =
    await admin.auth.getUser(token);

  const user = userData.user;
  if (!user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id,role,active")
    .eq("id", user.id)
    .single();

  if (
    !profile?.active ||
    !["CEO", "ADMIN"].includes(profile.role)
  ) {
    return null;
  }

  return profile;
}

export async function POST(request: NextRequest) {
  try {
    const profile = await authorize(request);

    if (!profile) {
      return NextResponse.json(
        { error: "Not authorized." },
        { status: 401 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !from) {
      return NextResponse.json(
        {
          error:
            "Email is not configured yet. Add RESEND_API_KEY and RESEND_FROM_EMAIL to your environment variables.",
        },
        { status: 503 }
      );
    }

    const admin = supabaseAdmin();

    const { data: settings, error: settingsError } =
      await admin
        .from("business_settings")
        .select("shop_name,email")
        .eq("id", 1)
        .single();

    if (settingsError) {
      throw settingsError;
    }

    const managerEmail =
      String(settings?.email || "").trim();

    if (!managerEmail) {
      return NextResponse.json(
        {
          error:
            "Manager email is empty. Add the manager email in Business Settings first.",
        },
        { status: 400 }
      );
    }

    const { workbook, report } =
      await buildWeeklyWorkbook({
        currentWeek: true,
      });

    const attachment = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "base64",
    });

    const filename = await weeklyFilename({
      currentWeek: true,
    });

    const shopName =
      settings?.shop_name || "Roba Dabo";

    const response = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [managerEmail],
          subject: `${shopName} Weekly Business Report`,
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5">
              <h2>${shopName} Weekly Business Report</h2>
              <p>Your weekly Excel report is attached.</p>
              <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse">
                <tr><td><b>Revenue</b></td><td>${report.summary.revenue.toFixed(2)} Birr</td></tr>
                <tr><td><b>Gross Profit</b></td><td>${report.summary.grossProfit.toFixed(2)} Birr</td></tr>
                <tr><td><b>Expenses</b></td><td>${report.summary.totalExpenses.toFixed(2)} Birr</td></tr>
                <tr><td><b>Net Profit</b></td><td>${report.summary.netProfit.toFixed(2)} Birr</td></tr>
                <tr><td><b>Transactions</b></td><td>${report.summary.transactions}</td></tr>
                <tr><td><b>Items Sold</b></td><td>${report.summary.itemsSold}</td></tr>
              </table>
              <p>Generated automatically by Roba Dabo.</p>
            </div>
          `,
          attachments: [
            {
              filename,
              content: attachment,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      console.error("Resend error:", body);
      return NextResponse.json(
        { error: "Email provider rejected the report." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      email: managerEmail,
      filename,
    });
  } catch (error) {
    console.error("Weekly email error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send weekly report.",
      },
      { status: 500 }
    );
  }
}
