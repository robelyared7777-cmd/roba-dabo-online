import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server-admin";
import { buildWeeklyWorkbook, weeklyFilename } from "@/lib/weekly-report";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length);
  const admin = supabaseAdmin();
  const { data: userData } = await admin.auth.getUser(token);
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

export async function GET(request: NextRequest) {
  try {
    const profile = await authorize(request);

    if (!profile) {
      return NextResponse.json(
        { error: "Not authorized." },
        { status: 401 }
      );
    }

    const { workbook } = await buildWeeklyWorkbook({
      currentWeek: true,
    });

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    const filename = await weeklyFilename({
      currentWeek: true,
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Weekly Excel error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not generate weekly report.",
      },
      { status: 500 }
    );
  }
}
