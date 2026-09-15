import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server-admin";
import {
  buildWeeklyWorkbook,
  weeklyFilename,
} from "@/lib/weekly-report";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authorization = request.headers.get("authorization");

    if (
      !cronSecret ||
      authorization !== `Bearer ${cronSecret}`
    ) {
      return NextResponse.json(
        { error: "Unauthorized cron request." },
        { status: 401 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !from) {
      return NextResponse.json(
        { error: "Email service is not configured." },
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

    const managerEmail = String(
      settings?.email || ""
    ).trim();

    if (!managerEmail) {
      return NextResponse.json(
        { error: "Manager email is not configured." },
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
              <p>This week's Roba Dabo report is attached.</p>
              <p><b>Revenue:</b> ${report.summary.revenue.toFixed(2)} Birr</p>
              <p><b>Net Profit:</b> ${report.summary.netProfit.toFixed(2)} Birr</p>
              <p><b>Transactions:</b> ${report.summary.transactions}</p>
              <p><b>Items Sold:</b> ${report.summary.itemsSold}</p>
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
      console.error("Cron Resend error:", body);
      return NextResponse.json(
        { error: "Email provider rejected the report." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sentTo: managerEmail,
      filename,
    });
  } catch (error) {
    console.error("Weekly cron report error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Weekly report failed.",
      },
      { status: 500 }
    );
  }
}
