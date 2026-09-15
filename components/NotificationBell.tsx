"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentProfile } from "@/lib/current-user";

type NotificationMessage = {
  id: string;
  sender_id: string;
  sender_name: string | null;
  receiver_id: string;
  message: string;
  created_at: string;
};

type RealtimePayload = {
  new: NotificationMessage;
};

export default function NotificationBell() {
  const sb = supabaseBrowser();

  const [userId, setUserId] =
    useState<string | null>(null);

  const [unread, setUnread] =
    useState(0);

  const [popup, setPopup] =
    useState<NotificationMessage | null>(
      null
    );

  // ============================================================
  // LOAD USER
  // ============================================================

  useEffect(() => {
    async function loadUser() {
      const profile =
        await getCurrentProfile();

      if (profile) {
        setUserId(profile.id);
      }
    }

    loadUser();
  }, []);

  // ============================================================
  // LOAD UNREAD COUNT
  // ============================================================

  useEffect(() => {
    if (!userId) return;

    async function loadUnread() {
      const { count, error } =
        await sb
          .from("chat_messages")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "receiver_id",
            userId
          )
          .is("read_at", null);

      if (error) {
        console.error(
          "Notification count error:",
          error.message
        );
        return;
      }

      setUnread(count || 0);
    }

    loadUnread();
  }, [userId]);

  // ============================================================
  // REALTIME NOTIFICATIONS
  // ============================================================

  useEffect(() => {
    if (!userId) return;

    const channel = sb
      .channel(
        `global-notifications-${userId}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter:
            `receiver_id=eq.${userId}`,
        },
        async (
          payload: RealtimePayload
        ) => {
          const msg =
            payload.new;

          if (
            msg.receiver_id !== userId
          ) {
            return;
          }

          // ====================================================
          // IN-APP POPUP
          // ====================================================

          setPopup(msg);

          // ====================================================
          // UNREAD COUNT
          // ====================================================

          setUnread(
            (previous) =>
              previous + 1
          );

          // ====================================================
          // BROWSER NOTIFICATION
          // ====================================================

          if (
            typeof window !==
              "undefined" &&
            "Notification" in
              window
          ) {
            try {
              if (
                Notification.permission ===
                "default"
              ) {
                await Notification.requestPermission();
              }

              if (
                Notification.permission ===
                "granted"
              ) {
                new Notification(
                  `💬 New message from ${
                    msg.sender_name ||
                    "Roba Dabo"
                  }`,
                  {
                    body: msg.message,
                    icon:
                      "/favicon.ico",
                  }
                );
              }
            } catch (error) {
              console.error(
                "Browser notification error:",
                error
              );
            }
          }
        }
      )
      .subscribe(
        (status: string) => {
          console.log(
            "Global notification status:",
            status
          );
        }
      );

    return () => {
      sb.removeChannel(channel);
    };
  }, [userId]);

  // ============================================================
  // CLOSE POPUP
  // ============================================================

  function closePopup() {
    setPopup(null);
  }

  // ============================================================
  // UI
  // ============================================================

  return (
    <>
      {/* ======================================================
          NOTIFICATION BUTTON
      ======================================================= */}

      <div
        style={{
          position: "relative",
          display: "inline-flex",
        }}
      >
        <button
          type="button"
          title="Notifications"
          onClick={() =>
            setPopup(null)
          }
          style={{
            position: "relative",
            border: "none",
            background:
              "#eef1f5",
            borderRadius:
              "10px",
            padding:
              "10px 14px",
            fontSize:
              "20px",
            cursor:
              "pointer",
          }}
        >
          🔔

          {unread > 0 && (
            <span
              style={{
                position:
                  "absolute",
                top: "-5px",
                right: "-5px",
                minWidth:
                  "20px",
                height:
                  "20px",
                padding:
                  "0 5px",
                borderRadius:
                  "999px",
                background:
                  "red",
                color:
                  "white",
                fontSize:
                  "11px",
                fontWeight:
                  "bold",
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
              }}
            >
              {unread > 99
                ? "99+"
                : unread}
            </span>
          )}
        </button>
      </div>

      {/* ======================================================
          MESSAGE POPUP
      ======================================================= */}

      {popup && (
        <div
          style={{
            position:
              "fixed",
            top:
              "85px",
            right:
              "25px",
            width:
              "360px",
            maxWidth:
              "calc(100vw - 40px)",
            background:
              "white",
            border:
              "1px solid #ddd",
            borderRadius:
              "14px",
            padding:
              "16px",
            boxShadow:
              "0 15px 40px rgba(0,0,0,0.25)",
            zIndex:
              99999,
          }}
        >
          {/* HEADER */}

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              marginBottom:
                "10px",
            }}
          >
            <strong>
              💬 New Message
            </strong>

            <button
              type="button"
              onClick={
                closePopup
              }
              style={{
                border:
                  "none",
                background:
                  "transparent",
                fontSize:
                  "22px",
                cursor:
                  "pointer",
              }}
            >
              ×
            </button>
          </div>

          {/* SENDER */}

          <div
            style={{
              fontWeight:
                "bold",
              marginBottom:
                "6px",
            }}
          >
            {popup.sender_name ||
              "Unknown user"}
          </div>

          {/* MESSAGE */}

          <div
            style={{
              padding:
                "10px",
              background:
                "#f3f4f6",
              borderRadius:
                "10px",
              wordBreak:
                "break-word",
            }}
          >
            {popup.message}
          </div>

          {/* TIME */}

          <div
            style={{
              marginTop:
                "8px",
              fontSize:
                "11px",
              opacity:
                0.6,
            }}
          >
            {new Date(
              popup.created_at
            ).toLocaleString()}
          </div>
        </div>
      )}
    </>
  );
}