"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  supabaseBrowser,
} from "@/lib/supabase-browser";

import {
  getCurrentProfile,
} from "@/lib/current-user";

import NotificationBell from "@/components/NotificationBell";

export default function Nav() {
  const router = useRouter();

  const [role, setRole] =
    useState<string>("");

  const [loading, setLoading] =
    useState(true);

  // ============================================================
  // LOAD PROFILE
  // ============================================================

  useEffect(() => {
    async function loadProfile() {
      try {
        const profile =
          await getCurrentProfile();

        if (profile) {
          setRole(
            profile.role
          );
        } else {
          setRole("");
        }
      } catch (error) {
        console.error(
          "Navigation profile error:",
          error
        );

        setRole("");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  // ============================================================
  // LOGOUT
  // ============================================================

  async function logout() {
    await supabaseBrowser()
      .auth
      .signOut();

    router.push(
      "/login"
    );
  }

  const management =
    role === "CEO" ||
    role === "ADMIN";

  // ============================================================
  // NAVIGATION
  // ============================================================

  return (
    <nav
      className="nav"
      style={{
        display:
          "flex",
        alignItems:
          "center",
        gap:
          "10px",
        flexWrap:
          "wrap",
      }}
    >

      {/* DASHBOARD */}

      <Link href="/dashboard">
        Dashboard
      </Link>

      {/* COMMUNICATION */}

      <Link href="/communication">
        💬 Communication
      </Link>

      {/* POS */}

      <Link href="/pos">
        POS
      </Link>

      {/* MANAGEMENT */}

      {management && (
        <Link href="/inventory">
          Inventory
        </Link>
      )}

      {management && (
        <Link href="/employees">
          Employees
        </Link>
      )}

      {management && (
        <Link href="/reports">
          Reports
        </Link>
      )}

      {management && (
        <Link href="/settings">
          Settings
        </Link>
      )}

      {/* NOTIFICATION BELL */}

      {!loading && (
        <NotificationBell />
      )}

      {/* LOGOUT */}

      <button
        type="button"
        onClick={logout}
      >
        Logout
      </button>

    </nav>
  );
}