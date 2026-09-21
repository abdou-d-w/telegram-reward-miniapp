const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const state = {
  user: null,
  initData: tg.initData || "",
  startParam: tg.initDataUnsafe?.start_param || ""
};

const $ = (id) => document.getElementById(id);

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const body = options.body ? JSON.stringify({
    ...options.body,
    initData: state.initData
  }) : undefined;

  const response = await fetch(url, {
    ...options,
    headers,
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function setUserUI(user) {
  state.user = user;
  $("username").textContent = user.display_name || user.first_name || "Telegram User";
  $("points").textContent = user.points ?? 0;
  $("profileName").textContent = user.first_name || "-";
  $("profileUsername").textContent = user.username ? `@${user.username}` : "-";
  $("profilePoints").textContent = user.points ?? 0;
  $("profileReferrals").textContent = user.referral_count ?? 0;
  $("referralCount").textContent = user.referral_count ?? 0;

  const photo = tg.initDataUnsafe?.user?.photo_url;
  if (photo) {
    $("avatar").innerHTML = `<img src="${photo}" alt="Profile">`;
    $("profileAvatar").innerHTML = `<img src="${photo}" alt="Profile">`;
  }
}

async function loadUser() {
  const data = await api("/api/user", {
    method: "POST",
    body: { startParam: state.startParam }
  });
  setUserUI(data.user);

  if (data.referralApplied) {
    toast("🎉 Referral bonus added!");
    tg.showAlert("🎉 Welcome!\n\nYou received 100 points.\nYour inviter received 500 points.");
  }
}

async function claimDailyReward() {
  const btn = $("dailyRewardBtn");
  const msg = $("dailyRewardMessage");
  btn.disabled = true;
  btn.textContent = "⏳ Claiming...";
  try {
    const data = await api("/api/daily-reward", { method: "POST", body: {} });
    if (data.claimed) {
      $("points").textContent = data.points;
      $("profilePoints").textContent = data.points;
      btn.textContent = "✅ Reward Claimed";
      msg.textContent = `🎉 +${data.reward} points added!`;
      tg.showAlert(`🎉 You received ${data.reward} points!`);
    } else {
      btn.textContent = "✅ Already Claimed";
      msg.textContent = "⏰ You already claimed today's reward.";
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "🎁 Claim Daily Reward";
    msg.textContent = e.message;
  }
}

async function loadTasks() {
  const list = $("tasksList");
  list.innerHTML = `<div class="section-card">Loading tasks...</div>`;
  try {
    const data = await api("/api/tasks", { method: "GET" });
    if (!data.tasks.length) {
      list.innerHTML = `<div class="section-card">No tasks available right now.</div>`;
      return;
    }
    list.innerHTML = data.tasks.map(t => `
      <article class="task">
        <div class="task-top">
          <div>
            <h3>${escapeHtml(t.title)}</h3>
            <p>${escapeHtml(t.description || "")}</p>
          </div>
          <div class="task-reward">+${t.reward}</div>
        </div>
        <div class="task-actions">
          <a href="${safeUrl(t.url)}" target="_blank" rel="noopener">Open</a>
          <button data-task-id="${t.id}" ${t.claimed ? "disabled" : ""}>
            ${t.claimed ? "✅ Claimed" : "Claim"}
          </button>
        </div>
      </article>
    `).join("");

    list.querySelectorAll("button[data-task-id]").forEach(btn => {
      btn.addEventListener("click", () => claimTask(btn.dataset.taskId, btn));
    });
  } catch (e) {
    list.innerHTML = `<div class="section-card">❌ ${escapeHtml(e.message)}</div>`;
  }
}

async function claimTask(id, btn) {
  btn.disabled = true;
  btn.textContent = "⏳";
  try {
    const data = await api(`/api/tasks/${id}/claim`, { method: "POST", body: {} });
    if (data.claimed) {
      $("points").textContent = data.points;
      $("profilePoints").textContent = data.points;
      btn.textContent = "✅ Claimed";
      toast(`🎉 +${data.reward} points`);
    } else {
      btn.textContent = "✅ Claimed";
      toast(data.message);
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Claim";
    toast(e.message);
  }
}

async function loadReferral() {
  try {
    const data = await api("/api/referral", { method: "GET" });
    $("referralLink").value = data.referralLink;
    $("referralCount").textContent = data.referralCount;
  } catch (e) {
    $("referralLink").value = "Unavailable";
  }
}

async function shareReferral() {
  const link = $("referralLink").value;
  const text = "Join me on TapRush and earn points!";
  if (tg.openTelegramLink) {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    tg.openTelegramLink(shareUrl);
  } else {
    await navigator.clipboard.writeText(link);
    toast("Referral link copied!");
  }
}

async function loadLeaderboard() {
  const list = $("leaderboardList");
  list.innerHTML = `<div class="section-card">Loading...</div>`;
  try {
    const data = await api("/api/leaderboard", { method: "GET" });
    list.innerHTML = data.leaderboard.map((u, i) => `
      <div class="leader-row">
        <div class="rank">#${i + 1}</div>
        <div class="leader-name">
          <strong>${escapeHtml(u.first_name || "User")}</strong>
          <span>${u.username ? "@" + escapeHtml(u.username) : "Telegram user"}</span>
        </div>
        <div class="leader-points">${u.points} pts</div>
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = `<div class="section-card">❌ ${escapeHtml(e.message)}</div>`;
  }
}

async function withdraw() {
  const amount = Number($("withdrawAmount").value);
  const method = $("withdrawMethod").value;
  const destination = $("withdrawDestination").value.trim();
  const msg = $("withdrawMessage");

  if (!Number.isInteger(amount) || amount < 1000) {
    msg.textContent = "Minimum withdrawal is 1000 points.";
    return;
  }
  if (!method || !destination) {
    msg.textContent = "Please fill all withdrawal fields.";
    return;
  }

  $("withdrawBtn").disabled = true;
  msg.textContent = "Submitting...";

  try {
    const data = await api("/api/withdraw", {
      method: "POST",
      body: { amount, method, destination }
    });
    msg.textContent = "✅ Request submitted for review.";
    $("points").textContent = state.user.points - amount;
    $("profilePoints").textContent = state.user.points - amount;
    state.user.points -= amount;
  } catch (e) {
    msg.textContent = "❌ " + e.message;
  } finally {
    $("withdrawBtn").disabled = false;
  }
}

function navigate(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const target = $(`page-${page}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(b => {
    b.classList.toggle("active", b.dataset.page === page);
  });

  if (page === "tasks") loadTasks();
  if (page === "referral") loadReferral();
  if (page === "ranking") loadLeaderboard();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    if (["http:", "https:", "tg:"].includes(u.protocol)) return u.href;
  } catch {}
  return "#";
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll("[data-page]").forEach(el => {
    el.addEventListener("click", () => navigate(el.dataset.page));
  });

  $("dailyRewardBtn").addEventListener("click", claimDailyReward);
  $("copyReferralBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("referralLink").value);
      toast("✅ Referral link copied!");
    } catch {
      $("referralLink").select();
      document.execCommand("copy");
      toast("✅ Referral link copied!");
    }
  });
  $("shareReferralBtn").addEventListener("click", shareReferral);
  $("withdrawBtn").addEventListener("click", withdraw);

  try {
    await loadUser();
  } catch (e) {
    console.error(e);
    toast("Could not load Telegram user.");
  }
});
