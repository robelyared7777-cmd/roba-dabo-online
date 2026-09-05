"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentProfile } from "@/lib/current-user";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  phone: string;
  employee_code: string;
};

type PrivateMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

type TeamMessage = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

type Announcement = {
  id: string;
  title: string;
  message: string;
  important: boolean;
  created_at: string;
  created_by: string;
};

type PresenceState = {
  [key: string]: Array<{
    user_id?: string;
    device_id?: string;
    online_at?: string;
  }>;
};

export default function CommunicationPage() {
  const router = useRouter();
  const sb = supabaseBrowser();

  // ============================================================
  // CURRENT USER
  // ============================================================

  const [me, setMe] = useState<Profile | null>(null);

  // ============================================================
  // USERS
  // ============================================================

  const [users, setUsers] = useState<Profile[]>([]);

  // ============================================================
  // PRIVATE CHAT
  // ============================================================

  const [selectedUser, setSelectedUser] =
    useState<Profile | null>(null);

  const [messages, setMessages] =
    useState<PrivateMessage[]>([]);

  // ============================================================
  // UNREAD COUNTS
  // ============================================================

  const [unreadByUser, setUnreadByUser] =
    useState<Record<string, number>>({});

  const [totalUnread, setTotalUnread] =
    useState(0);

  // ============================================================
  // ONLINE USERS
  // ============================================================

  const [onlineUsers, setOnlineUsers] =
    useState<Set<string>>(new Set());

  // ============================================================
  // TEAM CHAT
  // ============================================================

  const [teamMessages, setTeamMessages] =
    useState<TeamMessage[]>([]);

  // ============================================================
  // ANNOUNCEMENTS
  // ============================================================

  const [announcements, setAnnouncements] =
    useState<Announcement[]>([]);

  // ============================================================
  // UI
  // ============================================================

  const [activeTab, setActiveTab] = useState<
    "private" | "team" | "announcements"
  >("private");

  const [text, setText] = useState("");

  const [notification, setNotification] =
    useState<{
      senderName: string;
      message: string;
    } | null>(null);

  const [loading, setLoading] = useState(true);

  const bottomRef =
    useRef<HTMLDivElement | null>(null);

  // ============================================================
  // UNIQUE DEVICE ID
  //
  // Every browser/device gets a different ID.
  // This is important for independent multi-device login.
  // ============================================================

  const deviceIdRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    let deviceId =
      window.localStorage.getItem(
        "roba_dabo_device_id"
      );

    if (!deviceId) {
      deviceId =
        `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 12)}`;

      window.localStorage.setItem(
        "roba_dabo_device_id",
        deviceId
      );
    }

    deviceIdRef.current = deviceId;
  }, []);

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const profile =
        await getCurrentProfile();

      if (!profile) {
        router.push("/login");
        return;
      }

      setMe(profile);

      await Promise.all([
        loadUsers(profile.id),
        loadTeamMessages(),
        loadAnnouncements(),
        loadUnreadMessages(profile.id),
      ]);
    } catch (error) {
      console.error(
        "Communication loading error:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // LOAD USERS
  // ============================================================

  async function loadUsers(myId: string) {
    const { data, error } = await sb
      .from("profiles")
      .select(
        "id,full_name,role,active,phone,employee_code"
      )
      .eq("active", true)
      .neq("id", myId)
      .order("full_name");

    if (error) {
      console.error(
        "Users loading error:",
        error.message
      );
      return;
    }

    setUsers(data || []);
  }

  // ============================================================
  // LOAD ALL UNREAD PRIVATE MESSAGES
  //
  // Creates:
  //
  // user A -> 2 unread
  // user B -> 1 unread
  // user C -> 0 unread
  //
  // ============================================================

  async function loadUnreadMessages(
    myId: string
  ) {
    const { data, error } = await sb
      .from("chat_messages")
      .select("id,sender_id")
      .eq("receiver_id", myId)
      .is("read_at", null);

    if (error) {
      console.error(
        "Unread messages error:",
        error.message
      );
      return;
    }

    const counts: Record<string, number> = {};

    for (const message of data || []) {
      counts[message.sender_id] =
        (counts[message.sender_id] || 0) + 1;
    }

    setUnreadByUser(counts);

    const total = Object.values(counts).reduce(
      (sum, value) => sum + value,
      0
    );

    setTotalUnread(total);
  }

  // ============================================================
  // UPDATE UNREAD TOTAL
  // ============================================================

  function calculateTotalUnread(
    counts: Record<string, number>
  ) {
    return Object.values(counts).reduce(
      (sum, value) => sum + value,
      0
    );
  }

  // ============================================================
  // LOAD PRIVATE MESSAGES
  // ============================================================

  async function loadPrivateMessages(
    userId: string
  ) {
    if (!me) return;

    const { data, error } = await sb
      .from("chat_messages")
      .select(
        "id,sender_id,receiver_id,message,created_at,read_at"
      )
      .or(
        `and(sender_id.eq.${me.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${me.id})`
      )
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Private messages error:",
        error.message
      );
      return;
    }

    setMessages(data || []);
  }

  // ============================================================
  // MARK CHAT AS READ
  // ============================================================

  async function markMessagesAsRead(
    userId: string
  ) {
    if (!me) return;

    const { error } = await sb
      .from("chat_messages")
      .update({
        read_at: new Date().toISOString(),
      })
      .eq("sender_id", userId)
      .eq("receiver_id", me.id)
      .is("read_at", null);

    if (error) {
      console.error(
        "Mark read error:",
        error.message
      );
      return;
    }

    setUnreadByUser((previous) => {
      const updated = {
        ...previous,
      };

      delete updated[userId];

      setTotalUnread(
        calculateTotalUnread(updated)
      );

      return updated;
    });
  }

  // ============================================================
  // SELECT USER
  // ============================================================

  async function selectUser(
    user: Profile
  ) {
    setSelectedUser(user);
    setText("");

    await loadPrivateMessages(user.id);

    await markMessagesAsRead(user.id);
  }

  // ============================================================
  // FIND SENDER NAME
  // ============================================================

  async function getSenderName(
    senderId: string
  ) {
    const existingUser =
      users.find(
        (user) =>
          user.id === senderId
      );

    if (existingUser) {
      return existingUser.full_name;
    }

    const { data, error } = await sb
      .from("profiles")
      .select("full_name")
      .eq("id", senderId)
      .single();

    if (error) {
      console.error(
        "Sender lookup error:",
        error.message
      );

      return "Unknown user";
    }

    return data?.full_name ||
      "Unknown user";
  }

  // ============================================================
  // SEND PRIVATE MESSAGE
  // ============================================================

  async function sendPrivateMessage() {
    if (!me || !selectedUser) {
      return;
    }

    const message = text.trim();

    if (!message) {
      return;
    }

    const { error } = await sb
      .from("chat_messages")
      .insert({
        sender_id: me.id,
        receiver_id: selectedUser.id,
        message,
      });

    if (error) {
      console.error(
        "Send message failed"
      );

      console.error(
        "Message:",
        error.message
      );

      console.error(
        "Details:",
        error.details
      );

      console.error(
        "Hint:",
        error.hint
      );

      console.error(
        "Code:",
        error.code
      );

      alert(
        `Could not send message.\n\n${
          error.message ||
          "Unknown error"
        }`
      );

      return;
    }

    setText("");

    await loadPrivateMessages(
      selectedUser.id
    );
  }

  // ============================================================
  // LOAD TEAM MESSAGES
  // ============================================================

  async function loadTeamMessages() {
    const { data, error } = await sb
      .from("team_messages")
      .select(
        "id,sender_id,message,created_at,read_at"
      )
      .order("created_at", {
        ascending: true,
      })
      .limit(200);

    if (error) {
      console.error(
        "Team messages error:",
        error.message
      );
      return;
    }

    setTeamMessages(data || []);
  }

  // ============================================================
  // SEND TEAM MESSAGE
  // ============================================================

  async function sendTeamMessage() {
    if (!me) return;

    const message = text.trim();

    if (!message) return;

    const { error } = await sb
      .from("team_messages")
      .insert({
        sender_id: me.id,
        message,
      });

    if (error) {
      console.error(
        "Team message error:",
        error.message
      );

      alert(
        `Could not send team message.\n\n${
          error.message ||
          "Unknown error"
        }`
      );

      return;
    }

    setText("");

    await loadTeamMessages();
  }

  // ============================================================
  // LOAD ANNOUNCEMENTS
  // ============================================================

  async function loadAnnouncements() {
    const { data, error } = await sb
      .from("announcements")
      .select(
        "id,title,message,important,created_at,created_by"
      )
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Announcements error:",
        error.message
      );
      return;
    }

    setAnnouncements(data || []);
  }

  // ============================================================
  // ONLINE / OFFLINE PRESENCE
  //
  // IMPORTANT:
  //
  // Every DEVICE gets its own presence key.
  //
  // Same account:
  //
  // Phone  -> online
  // Laptop -> online
  // PC     -> online
  //
  // If phone logs out:
  //
  // Laptop -> still online
  // PC     -> still online
  //
  // ============================================================

  useEffect(() => {
    if (!me) return;

    const deviceId =
      deviceIdRef.current ||
      `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 10)}`;

    const presenceKey =
      `${me.id}:${deviceId}`;

    const channel = sb.channel(
      "roba-dabo-online-users",
      {
        config: {
          presence: {
            key: presenceKey,
          },
        },
      }
    );

    function updatePresence() {
      const state =
        channel.presenceState() as PresenceState;

      const online = new Set<string>();

      Object.values(state).forEach(
        (entries) => {
          entries.forEach(
            (entry) => {
              if (entry.user_id) {
                online.add(
                  entry.user_id
                );
              }
            }
          );
        }
      );

      setOnlineUsers(online);
    }

    channel
      .on(
        "presence",
        {
          event: "sync",
        },
        () => {
          updatePresence();
        }
      )
      .on(
        "presence",
        {
          event: "join",
        },
        () => {
          updatePresence();
        }
      )
      .on(
        "presence",
        {
          event: "leave",
        },
        () => {
          updatePresence();
        }
      )
      .subscribe(async (status: string) => {
        console.log(
          "Roba Dabo presence:",
          status
        );

        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: me.id,
            device_id: deviceId,
            online_at:
              new Date().toISOString(),
          });

          updatePresence();
        }
      });

    return () => {
      channel.untrack();
      sb.removeChannel(channel);
    };
  }, [me]);

  // ============================================================
  // PRIVATE MESSAGE REALTIME
  //
  // Notification ONLY exists inside Communication.
  // ============================================================

  useEffect(() => {
    if (!me) return;

    const channel = sb
      .channel(
        `private-messages-${me.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter:
            `receiver_id=eq.${me.id}`,
        },
        async (payload: { new: PrivateMessage }) => {
          const newMessage =
            payload.new as PrivateMessage;

          if (
            newMessage.sender_id ===
            me.id
          ) {
            return;
          }

          const senderName =
            await getSenderName(
              newMessage.sender_id
            );

          // ====================================================
          // IF CURRENTLY CHATTING WITH SENDER
          // ====================================================

          if (
            selectedUser?.id ===
            newMessage.sender_id
          ) {
            await loadPrivateMessages(
              newMessage.sender_id
            );

            await markMessagesAsRead(
              newMessage.sender_id
            );

            return;
          }

          // ====================================================
          // UNREAD BADGE FOR THAT SPECIFIC USER
          // ====================================================

          setUnreadByUser(
            (previous) => {
              const updated = {
                ...previous,
                [newMessage.sender_id]:
                  (previous[
                    newMessage
                      .sender_id
                  ] || 0) + 1,
              };

              setTotalUnread(
                calculateTotalUnread(
                  updated
                )
              );

              return updated;
            }
          );

          // ====================================================
          // COMMUNICATION NOTIFICATION
          // ====================================================

          setNotification({
            senderName,
            message:
              newMessage.message,
          });
        }
      )
      .subscribe((status: string) => {
        console.log(
          "Private chat realtime:",
          status
        );
      });

    return () => {
      sb.removeChannel(channel);
    };
  }, [
    me,
    selectedUser,
    users,
  ]);

  // ============================================================
  // TEAM REALTIME
  // ============================================================

  useEffect(() => {
    if (!me) return;

    const channel = sb
      .channel(
        "roba-dabo-team-messages"
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_messages",
        },
        async () => {
          await loadTeamMessages();
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [me]);

  // ============================================================
  // ANNOUNCEMENT REALTIME
  // ============================================================

  useEffect(() => {
    if (!me) return;

    const channel = sb
      .channel(
        "roba-dabo-announcements"
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "announcements",
        },
        async () => {
          await loadAnnouncements();
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [me]);

  // ============================================================
  // SCROLL CHAT
  // ============================================================

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [
    messages,
    teamMessages,
  ]);

  // ============================================================
  // KEYBOARD
  // ============================================================

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (e.key !== "Enter") {
      return;
    }

    e.preventDefault();

    if (activeTab === "private") {
      sendPrivateMessage();
    }

    if (activeTab === "team") {
      sendTeamMessage();
    }
  }

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <main className="page">
        <div className="card">
          <h2>
            Loading Communication
            Center...
          </h2>
        </div>
      </main>
    );
  }

  // ============================================================
  // MAIN PAGE
  // ============================================================

  return (
    <main className="page">

      {/* ======================================================
          NOTIFICATION POPUP
          ONLY INSIDE COMMUNICATION
      ======================================================= */}

      {notification && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            width: "370px",
            maxWidth:
              "calc(100vw - 40px)",
            background:
              "white",
            border:
              "2px solid #2563eb",
            borderRadius:
              "14px",
            padding:
              "16px",
            boxShadow:
              "0 15px 40px rgba(0,0,0,0.25)",
            zIndex: 99999,
          }}
        >

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
              🔔 New Message
            </strong>

            <button
              type="button"
              onClick={() =>
                setNotification(null)
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

          <div
            style={{
              fontWeight:
                "bold",
              marginBottom:
                "6px",
            }}
          >
            👤{" "}
            {notification.senderName}
          </div>

          <div
            style={{
              background:
                "#f3f4f6",
              borderRadius:
                "10px",
              padding:
                "10px",
              wordBreak:
                "break-word",
            }}
          >
            {notification.message}
          </div>

          <button
            className="btn primary"
            style={{
              marginTop:
                "12px",
              width:
                "100%",
            }}
            onClick={() => {
              const sender =
                users.find(
                  (user) =>
                    user.full_name ===
                    notification.senderName
                );

              if (sender) {
                setActiveTab(
                  "private"
                );

                selectUser(
                  sender
                );
              }

              setNotification(null);
            }}
          >
            Open Chat
          </button>

        </div>
      )}

      {/* ======================================================
          BACK BUTTON
      ======================================================= */}

      <button
        className="btn"
        onClick={() =>
          router.push(
            "/dashboard"
          )
        }
        style={{
          marginBottom:
            "15px",
        }}
      >
        ← Back to Dashboard
      </button>

      {/* ======================================================
          MAIN CARD
      ======================================================= */}

      <div
        className="card"
        style={{
          padding: 0,
          overflow:
            "hidden",
        }}
      >

        {/* ====================================================
            HEADER
        ===================================================== */}

        <div
          style={{
            padding:
              "20px",
            borderBottom:
              "1px solid #ddd",
          }}
        >

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              gap:
                "15px",
              flexWrap:
                "wrap",
            }}
          >

            <div>

              <h1
                style={{
                  margin:
                    0,
                }}
              >
                💬 Communication
                Center
              </h1>

              <p
                style={{
                  marginBottom:
                    0,
                }}
              >
                Chat, team
                messages and
                announcements
              </p>

            </div>

            {/* TOTAL NOTIFICATION */}

            <div
              style={{
                background:
                  totalUnread > 0
                    ? "#fee2e2"
                    : "#f3f4f6",
                color:
                  totalUnread > 0
                    ? "#b91c1c"
                    : "#555",
                borderRadius:
                  "12px",
                padding:
                  "10px 15px",
                fontWeight:
                  "bold",
              }}
            >
              🔔{" "}
              {totalUnread > 0
                ? `${totalUnread} unread`
                : "No new messages"}
            </div>

          </div>

        </div>

        {/* ====================================================
            TABS
        ===================================================== */}

        <div
          style={{
            display:
              "flex",
            gap:
              "8px",
            padding:
              "12px",
            borderBottom:
              "1px solid #ddd",
            overflowX:
              "auto",
          }}
        >

          <button
            className={
              activeTab ===
              "private"
                ? "btn primary"
                : "btn"
            }
            onClick={() =>
              setActiveTab(
                "private"
              )
            }
          >
            💬 Private Chat

            {totalUnread > 0 && (
              <span
                style={{
                  marginLeft:
                    "8px",
                  background:
                    "red",
                  color:
                    "white",
                  borderRadius:
                    "999px",
                  padding:
                    "2px 7px",
                  fontSize:
                    "12px",
                  fontWeight:
                    "bold",
                }}
              >
                {totalUnread >
                99
                  ? "99+"
                  : totalUnread}
              </span>
            )}

          </button>

          <button
            className={
              activeTab ===
              "team"
                ? "btn primary"
                : "btn"
            }
            onClick={() =>
              setActiveTab(
                "team"
              )
            }
          >
            👥 Team Chat
          </button>

          <button
            className={
              activeTab ===
              "announcements"
                ? "btn primary"
                : "btn"
            }
            onClick={() =>
              setActiveTab(
                "announcements"
              )
            }
          >
            📢 Announcements
          </button>

        </div>

        {/* ====================================================
            PRIVATE CHAT
        ===================================================== */}

        {activeTab ===
          "private" && (

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "300px 1fr",
              minHeight:
                "650px",
            }}
          >

            {/* =================================================
                USERS
            ================================================== */}

            <div
              style={{
                borderRight:
                  "1px solid #ddd",
                padding:
                  "15px",
                overflowY:
                  "auto",
              }}
            >

              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  marginBottom:
                    "15px",
                }}
              >

                <h3
                  style={{
                    margin:
                      0,
                  }}
                >
                  Employees &
                  Management
                </h3>

              </div>

              {users.length ===
                0 && (
                <p>
                  No other active
                  users.
                </p>
              )}

              {users.map(
                (user) => {

                  const unread =
                    unreadByUser[
                      user.id
                    ] || 0;

                  const online =
                    onlineUsers.has(
                      user.id
                    );

                  const selected =
                    selectedUser?.id ===
                    user.id;

                  return (
                    <button
                      key={
                        user.id
                      }
                      onClick={() =>
                        selectUser(
                          user
                        )
                      }
                      style={{
                        width:
                          "100%",
                        textAlign:
                          "left",
                        padding:
                          "12px",
                        marginBottom:
                          "8px",
                        border:
                          selected
                            ? "2px solid #2563eb"
                            : "1px solid #ddd",
                        borderRadius:
                          "12px",
                        background:
                          selected
                            ? "#f0f6ff"
                            : "white",
                        cursor:
                          "pointer",
                      }}
                    >

                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "10px",
                        }}
                      >

                        {/* ONLINE DOT */}

                        <span
                          title={
                            online
                              ? "Online"
                              : "Offline"
                          }
                          style={{
                            width:
                              "11px",
                            height:
                              "11px",
                            borderRadius:
                              "50%",
                            background:
                              online
                                ? "#22c55e"
                                : "#9ca3af",
                            display:
                              "inline-block",
                            flexShrink:
                              0,
                          }}
                        />

                        {/* NAME */}

                        <div
                          style={{
                            flex: 1,
                            minWidth:
                              0,
                          }}
                        >

                          <strong
                            style={{
                              display:
                                "block",
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {
                              user.full_name
                            }
                          </strong>

                          <div
                            style={{
                              fontSize:
                                "12px",
                              opacity:
                                0.7,
                            }}
                          >
                            {user.role}
                            {" • "}
                            {online
                              ? "Online"
                              : "Offline"}
                          </div>

                        </div>

                        {/* UNREAD BADGE */}

                        {unread >
                          0 && (
                          <span
                            style={{
                              minWidth:
                                "24px",
                              height:
                                "24px",
                              borderRadius:
                                "999px",
                              background:
                                "#ef4444",
                              color:
                                "white",
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              padding:
                                "0 6px",
                              fontSize:
                                "12px",
                              fontWeight:
                                "bold",
                              flexShrink:
                                0,
                            }}
                          >
                            {unread >
                            99
                              ? "99+"
                              : unread}
                          </span>
                        )}

                      </div>

                    </button>
                  );
                }
              )}

            </div>

            {/* =================================================
                CHAT
            ================================================== */}

            <div
              style={{
                display:
                  "flex",
                flexDirection:
                  "column",
                minWidth:
                  0,
              }}
            >

              {selectedUser ? (

                <>

                  {/* CHAT HEADER */}

                  <div
                    style={{
                      padding:
                        "15px 20px",
                      borderBottom:
                        "1px solid #ddd",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap:
                        "10px",
                    }}
                  >

                    <span
                      style={{
                        width:
                          "12px",
                        height:
                          "12px",
                        borderRadius:
                          "50%",
                        background:
                          onlineUsers.has(
                            selectedUser.id
                          )
                            ? "#22c55e"
                            : "#9ca3af",
                      }}
                    />

                    <div>

                      <strong>
                        {
                          selectedUser.full_name
                        }
                      </strong>

                      <div
                        style={{
                          fontSize:
                            "12px",
                          opacity:
                            0.7,
                        }}
                      >
                        {
                          selectedUser.role
                        }
                        {" • "}
                        {onlineUsers.has(
                          selectedUser.id
                        )
                          ? "Online"
                          : "Offline"}
                      </div>

                    </div>

                  </div>

                  {/* MESSAGES */}

                  <div
                    style={{
                      flex:
                        1,
                      padding:
                        "20px",
                      overflowY:
                        "auto",
                      minHeight:
                        "480px",
                    }}
                  >

                    {messages.length ===
                      0 && (
                      <div
                        style={{
                          textAlign:
                            "center",
                          opacity:
                            0.6,
                          paddingTop:
                            "120px",
                        }}
                      >

                        <div
                          style={{
                            fontSize:
                              "45px",
                          }}
                        >
                          💬
                        </div>

                        <h2>
                          No messages
                          yet
                        </h2>

                        <p>
                          Start the
                          conversation!
                        </p>

                      </div>
                    )}

                    {messages.map(
                      (msg) => {

                        const mine =
                          msg.sender_id ===
                          me?.id;

                        return (
                          <div
                            key={
                              msg.id
                            }
                            style={{
                              display:
                                "flex",
                              justifyContent:
                                mine
                                  ? "flex-end"
                                  : "flex-start",
                              marginBottom:
                                "10px",
                            }}
                          >

                            <div
                              style={{
                                maxWidth:
                                  "70%",
                                padding:
                                  "10px 14px",
                                borderRadius:
                                  "15px",
                                background:
                                  mine
                                    ? "#2563eb"
                                    : "#eeeeee",
                                color:
                                  mine
                                    ? "white"
                                    : "black",
                                wordBreak:
                                  "break-word",
                              }}
                            >

                              <div>
                                {
                                  msg.message
                                }
                              </div>

                              <small
                                style={{
                                  display:
                                    "block",
                                  marginTop:
                                    "5px",
                                  opacity:
                                    0.7,
                                  fontSize:
                                    "10px",
                                }}
                              >
                                {new Date(
                                  msg.created_at
                                ).toLocaleTimeString(
                                  [],
                                  {
                                    hour:
                                      "2-digit",
                                    minute:
                                      "2-digit",
                                  }
                                )}
                              </small>

                            </div>

                          </div>
                        );
                      }
                    )}

                    <div
                      ref={
                        bottomRef
                      }
                    />

                  </div>

                  {/* INPUT */}

                  <div
                    style={{
                      display:
                        "flex",
                      gap:
                        "10px",
                      padding:
                        "15px",
                      borderTop:
                        "1px solid #ddd",
                    }}
                  >

                    <input
                      className="input"
                      style={{
                        flex:
                          1,
                      }}
                      placeholder="Write a message..."
                      value={
                        text
                      }
                      onChange={(
                        e
                      ) =>
                        setText(
                          e.target
                            .value
                        )
                      }
                      onKeyDown={
                        handleKeyDown
                      }
                    />

                    <button
                      className="btn primary"
                      onClick={
                        sendPrivateMessage
                      }
                    >
                      Send
                    </button>

                  </div>

                </>

              ) : (

                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    minHeight:
                      "600px",
                  }}
                >

                  <div
                    style={{
                      textAlign:
                        "center",
                    }}
                  >

                    <div
                      style={{
                        fontSize:
                          "55px",
                      }}
                    >
                      💬
                    </div>

                    <h2>
                      Select someone
                      to chat
                    </h2>

                    <p>
                      Choose an
                      employee,
                      admin or CEO.
                    </p>

                  </div>

                </div>

              )}

            </div>

          </div>
        )}

        {/* ====================================================
            TEAM CHAT
        ===================================================== */}

        {activeTab ===
          "team" && (

          <div
            style={{
              display:
                "flex",
              flexDirection:
                "column",
              minHeight:
                "650px",
            }}
          >

            <div
              style={{
                padding:
                  "15px 20px",
                borderBottom:
                  "1px solid #ddd",
              }}
            >

              <h2
                style={{
                  margin:
                    0,
                }}
              >
                👥 Roba Dabo Team
              </h2>

              <small>
                Employees, Admins
                and CEO
              </small>

            </div>

            <div
              style={{
                flex:
                  1,
                padding:
                  "20px",
                overflowY:
                  "auto",
                minHeight:
                  "480px",
              }}
            >

              {teamMessages.length ===
                0 && (
                <div
                  style={{
                    textAlign:
                      "center",
                    opacity:
                      0.6,
                    paddingTop:
                      "120px",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "45px",
                    }}
                  >
                    👥
                  </div>

                  <h2>
                    No team
                    messages
                    yet
                  </h2>

                  <p>
                    Send the first
                    message to
                    everyone!
                  </p>
                </div>
              )}

              {teamMessages.map(
                (msg) => {

                  const mine =
                    msg.sender_id ===
                    me?.id;

                  const sender =
                    users.find(
                      (user) =>
                        user.id ===
                        msg.sender_id
                    );

                  return (
                    <div
                      key={
                        msg.id
                      }
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          mine
                            ? "flex-end"
                            : "flex-start",
                        marginBottom:
                          "12px",
                      }}
                    >

                      <div
                        style={{
                          maxWidth:
                            "70%",
                          padding:
                            "10px 14px",
                          borderRadius:
                            "15px",
                          background:
                            mine
                              ? "#2563eb"
                              : "#eeeeee",
                          color:
                            mine
                              ? "white"
                              : "black",
                          wordBreak:
                            "break-word",
                        }}
                      >

                        <div
                          style={{
                            fontSize:
                              "11px",
                            fontWeight:
                              "bold",
                            marginBottom:
                              "4px",
                          }}
                        >
                          {mine
                            ? "You"
                            : sender?.full_name ||
                              "Team member"}
                        </div>

                        <div>
                          {
                            msg.message
                          }
                        </div>

                        <small
                          style={{
                            display:
                              "block",
                            marginTop:
                              "5px",
                            opacity:
                              0.7,
                            fontSize:
                              "10px",
                          }}
                        >
                          {new Date(
                            msg.created_at
                          ).toLocaleTimeString(
                            [],
                            {
                              hour:
                                "2-digit",
                              minute:
                                "2-digit",
                            }
                          )}
                        </small>

                      </div>

                    </div>
                  );
                }
              )}

              <div
                ref={
                  bottomRef
                }
              />

            </div>

            <div
              style={{
                display:
                  "flex",
                gap:
                  "10px",
                padding:
                  "15px",
                borderTop:
                  "1px solid #ddd",
              }}
            >

              <input
                className="input"
                style={{
                  flex:
                    1,
                }}
                placeholder="Message everyone..."
                value={
                  text
                }
                onChange={(
                  e
                ) =>
                  setText(
                    e.target.value
                  )
                }
                onKeyDown={
                  handleKeyDown
                }
              />

              <button
                className="btn primary"
                onClick={
                  sendTeamMessage
                }
              >
                Send
              </button>

            </div>

          </div>
        )}

        {/* ====================================================
            ANNOUNCEMENTS
        ===================================================== */}

        {activeTab ===
          "announcements" && (

          <div
            style={{
              padding:
                "25px",
              minHeight:
                "650px",
            }}
          >

            <h2>
              📢 Roba Dabo
              Announcements
            </h2>

            {announcements.length ===
              0 && (
              <div className="card">
                <p>
                  No announcements
                  yet.
                </p>
              </div>
            )}

            {announcements.map(
              (
                announcement
              ) => {

                const creator =
                  users.find(
                    (user) =>
                      user.id ===
                      announcement.created_by
                  );

                return (
                  <div
                    key={
                      announcement.id
                    }
                    className="card"
                    style={{
                      marginBottom:
                        "15px",
                      borderLeft:
                        announcement.important
                          ? "5px solid red"
                          : "5px solid #2563eb",
                    }}
                  >

                    <div
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        gap:
                          "10px",
                      }}
                    >

                      <h3>
                        {announcement.important &&
                          "🚨 "}

                        {
                          announcement.title
                        }
                      </h3>

                      {announcement.important && (
                        <strong>
                          IMPORTANT
                        </strong>
                      )}

                    </div>

                    <p>
                      {
                        announcement.message
                      }
                    </p>

                    <small>
                      From:{" "}
                      {creator?.full_name ||
                        "Management"}
                      {" • "}
                      {new Date(
                        announcement.created_at
                      ).toLocaleString()}
                    </small>

                  </div>
                );
              }
            )}

          </div>
        )}

      </div>
    </main>
  );
}