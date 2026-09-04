import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server-admin";

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase public environment variables.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function authorize(req: NextRequest) {
  const token = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return {
      error: "Not authenticated",
      status: 401 as const,
    };
  }

  const pub = publicClient();

  const {
    data: { user },
    error,
  } = await pub.auth.getUser(token);

  if (error || !user) {
    return {
      error: "Not authenticated",
      status: 401 as const,
    };
  }

  // This is the SERVER Supabase admin client.
  const adminClient = supabaseAdmin();

  const {
    data: profile,
    error: profileError,
  } = await adminClient
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile?.active ||
    !["CEO", "ADMIN"].includes(profile.role)
  ) {
    return {
      error: "Management access required",
      status: 403 as const,
    };
  }

  return {
    user,
    role: profile.role as "CEO" | "ADMIN",
    adminClient,
  };
}

/* =========================================================
   GET - GET ALL EMPLOYEES
   ========================================================= */

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req);

    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    // Get employee profiles from database
    const {
      data: profiles,
      error: profileError,
    } = await auth.adminClient
      .from("profiles")
      .select(
        "id,full_name,role,active,phone,employee_code,email,created_at,updated_at"
      )
      .order("created_at", { ascending: true });

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      );
    }

    // IMPORTANT:
    // Auth admin functions are under:
    // auth.adminClient.auth.admin
    const {
      data: users,
      error: usersError,
    } = await auth.adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersError) {
      return NextResponse.json(
        { error: usersError.message },
        { status: 400 }
      );
    }

    const emailMap = new Map(
      (users.users ?? []).map((user) => [
        user.id,
        user.email ?? "",
      ])
    );

    const employees = (profiles ?? []).map((profile) => ({
      ...profile,
      email:
        profile.email ||
        emailMap.get(profile.id) ||
        "",
    }));

    return NextResponse.json({
      employees,
    });
  } catch (e) {
    console.error("GET /api/employees error:", e);

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Server error",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST - CREATE EMPLOYEE / ADMIN
   ========================================================= */

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req);

    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json();

    const fullName = String(
      body.full_name ?? ""
    ).trim();

    const email = String(
      body.email ?? ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      body.password ?? ""
    );

    const requestedRole =
      body.role === "ADMIN"
        ? "ADMIN"
        : "EMPLOYEE";

    // Only CEO can create ADMIN.
    // ADMIN can only create EMPLOYEE.
    const role =
      requestedRole === "ADMIN" &&
      auth.role === "CEO"
        ? "ADMIN"
        : "EMPLOYEE";

    const phone = String(
      body.phone ?? ""
    ).trim();

    const employeeCode = String(
      body.employee_code ?? ""
    ).trim();

    if (
      !fullName ||
      !email ||
      password.length < 8
    ) {
      return NextResponse.json(
        {
          error:
            "Name, email and a password of at least 8 characters are required.",
        },
        { status: 400 }
      );
    }

    /*
     * IMPORTANT:
     * Supabase Auth Admin functions are:
     *
     * adminClient.auth.admin.createUser()
     */

    const {
      data: created,
      error: createError,
    } =
      await auth.adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (createError || !created.user) {
      return NextResponse.json(
        {
          error:
            createError?.message ??
            "Could not create authentication user.",
        },
        { status: 400 }
      );
    }

    /*
     * Create the employee profile.
     */

    const {
      error: profileError,
    } = await auth.adminClient
      .from("profiles")
      .insert({
        id: created.user.id,
        full_name: fullName,
        role,
        active: true,
        phone,
        employee_code: employeeCode,
        email,
      });

    /*
     * If profile creation fails,
     * delete the Auth account so we don't
     * leave an incomplete employee.
     */

    if (profileError) {
      await auth.adminClient.auth.admin.deleteUser(
        created.user.id
      );

      return NextResponse.json(
        {
          error: profileError.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      employee_id: created.user.id,
    });
  } catch (e) {
    console.error("POST /api/employees error:", e);

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Server error",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   PATCH - EDIT EMPLOYEE
   ========================================================= */

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authorize(req);

    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json();

    const id = String(
      body.id ?? ""
    );

    if (!id) {
      return NextResponse.json(
        {
          error: "Employee id is required.",
        },
        { status: 400 }
      );
    }

    /*
     * Find employee.
     */

    const {
      data: target,
      error: targetError,
    } =
      await auth.adminClient
        .from("profiles")
        .select(
          "id,role,full_name,active"
        )
        .eq("id", id)
        .single();

    if (targetError || !target) {
      return NextResponse.json(
        {
          error: "Employee not found.",
        },
        { status: 404 }
      );
    }

    /*
     * CEO cannot be edited from Employee Management.
     */

    if (target.role === "CEO") {
      return NextResponse.json(
        {
          error:
            "CEO accounts cannot be edited or disabled from Employee Management.",
        },
        { status: 403 }
      );
    }

    /*
     * Employee cannot disable their own account.
     */

    if (
      id === auth.user.id &&
      body.active === false
    ) {
      return NextResponse.json(
        {
          error:
            "You cannot disable your own account.",
        },
        { status: 400 }
      );
    }

    /*
     * Only CEO can make somebody ADMIN.
     */

    const nextRole =
      body.role === "ADMIN" &&
      auth.role === "CEO"
        ? "ADMIN"
        : "EMPLOYEE";

    const updates: Record<
      string,
      unknown
    > = {};

    if (
      typeof body.full_name ===
      "string"
    ) {
      updates.full_name =
        body.full_name.trim();
    }

    if (
      typeof body.email === "string" &&
      body.email.trim()
    ) {
      updates.email =
        body.email
          .trim()
          .toLowerCase();
    }

    if (
      typeof body.phone === "string"
    ) {
      updates.phone =
        body.phone.trim();
    }

    if (
      typeof body.employee_code ===
      "string"
    ) {
      updates.employee_code =
        body.employee_code.trim();
    }

    if (
      typeof body.active === "boolean"
    ) {
      updates.active =
        body.active;
    }

    if (body.role) {
      updates.role =
        nextRole;
    }

    updates.updated_at =
      new Date().toISOString();

    /*
     * Update profile database record.
     */

    const {
      error: profileUpdateError,
    } =
      await auth.adminClient
        .from("profiles")
        .update(updates)
        .eq("id", id);

    if (profileUpdateError) {
      return NextResponse.json(
        {
          error:
            profileUpdateError.message,
        },
        { status: 400 }
      );
    }

    /*
     * Update Supabase Auth user.
     */

    const authUpdates: {
      email?: string;
      password?: string;
      user_metadata?: {
        full_name: string;
      };
    } = {};

    if (
      typeof body.email === "string" &&
      body.email.trim()
    ) {
      authUpdates.email =
        body.email
          .trim()
          .toLowerCase();
    }

    if (
      typeof body.password ===
        "string" &&
      body.password.length >= 8
    ) {
      authUpdates.password =
        body.password;
    }

    if (
      typeof body.full_name ===
      "string"
    ) {
      authUpdates.user_metadata = {
        full_name:
          body.full_name.trim(),
      };
    }

    /*
     * IMPORTANT:
     * Auth admin update:
     * auth.adminClient.auth.admin.updateUserById()
     */

    if (
      Object.keys(authUpdates).length
    ) {
      const {
        error: authError,
      } =
        await auth.adminClient.auth.admin.updateUserById(
          id,
          authUpdates
        );

      if (authError) {
        return NextResponse.json(
          {
            error:
              authError.message,
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (e) {
    console.error(
      "PATCH /api/employees error:",
      e
    );

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Server error",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   DELETE - DELETE EMPLOYEE
   ========================================================= */

export async function DELETE(
  req: NextRequest
) {
  try {
    const auth = await authorize(req);

    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json();

    const id = String(
      body.id ?? ""
    );

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Employee id is required.",
        },
        { status: 400 }
      );
    }

    /*
     * Cannot delete yourself.
     */

    if (id === auth.user.id) {
      return NextResponse.json(
        {
          error:
            "You cannot delete your own account.",
        },
        { status: 400 }
      );
    }

    /*
     * Find target employee.
     */

    const {
      data: target,
    } =
      await auth.adminClient
        .from("profiles")
        .select(
          "id,role,full_name"
        )
        .eq("id", id)
        .single();

    if (!target) {
      return NextResponse.json(
        {
          error:
            "Employee not found.",
        },
        { status: 404 }
      );
    }

    /*
     * CEO cannot be deleted.
     */

    if (target.role === "CEO") {
      return NextResponse.json(
        {
          error:
            "CEO accounts cannot be deleted.",
        },
        { status: 403 }
      );
    }

    /*
     * ADMIN can delete employees,
     * but only CEO can delete ADMIN.
     */

    if (
      target.role === "ADMIN" &&
      auth.role !== "CEO"
    ) {
      return NextResponse.json(
        {
          error:
            "Only the CEO can delete an Administrator.",
        },
        { status: 403 }
      );
    }

    /*
     * Check whether employee has sales.
     */

    const {
      count,
      error: salesError,
    } =
      await auth.adminClient
        .from("sales")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq(
          "employee_id",
          id
        );

    if (salesError) {
      return NextResponse.json(
        {
          error:
            salesError.message,
        },
        { status: 400 }
      );
    }

    /*
     * Don't permanently delete
     * employees who have sales history.
     */

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `${
            target.full_name ||
            "This employee"
          } has ${count} recorded sale(s). For data safety, disable the account instead of permanently deleting it.`,
        },
        { status: 409 }
      );
    }

    /*
     * IMPORTANT:
     * Supabase Auth delete:
     * auth.adminClient.auth.admin.deleteUser()
     */

    const {
      error: deleteError,
    } =
      await auth.adminClient.auth.admin.deleteUser(
        id
      );

    if (deleteError) {
      return NextResponse.json(
        {
          error:
            deleteError.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (e) {
    console.error(
      "DELETE /api/employees error:",
      e
    );

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Server error",
      },
      { status: 500 }
    );
  }
}