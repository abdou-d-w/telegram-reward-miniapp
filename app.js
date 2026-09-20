const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const telegramUser = tg.initDataUnsafe?.user;

if (telegramUser) {
    // عرض اسم المستخدم
    document.getElementById("username").textContent =
        telegramUser.first_name ||
        telegramUser.username ||
        "Telegram User";

    // عرض الصورة الأولى للحساب إن وجدت
    if (telegramUser.photo_url) {
        document.getElementById("avatar").innerHTML =
            `<img src="${telegramUser.photo_url}" alt="Profile">`;
    }

    // إرسال بيانات Telegram إلى السيرفر
    fetch("/api/user", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            initData: tg.initData
        })
    })
    .then(response => response.json())
    .then(data => {

        console.log("Server response:", data);

        if (data.success && data.user) {

            // الاسم من قاعدة البيانات
            document.getElementById("username").textContent =
                data.user.display_name ||
                telegramUser.first_name ||
                telegramUser.username ||
                "Telegram User";

            // النقاط
            const pointsElement = document.getElementById("points");

            if (pointsElement) {
                pointsElement.textContent =
                    data.user.points || 0;
            }
        }
    })
    .catch(error => {
        console.error("API Error:", error);
    });

} else {
    document.getElementById("username").textContent =
        "Telegram User";
}
// ===============================
// DAILY REWARD
// ===============================

const dailyRewardBtn = document.getElementById("dailyRewardBtn");
const dailyRewardMessage = document.getElementById("dailyRewardMessage");

if (dailyRewardBtn) {

    dailyRewardBtn.addEventListener("click", async () => {

        dailyRewardBtn.disabled = true;
        dailyRewardMessage.textContent = "⏳ Claiming reward...";

        try {

            const response = await fetch("/api/daily-reward", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    initData: tg.initData
                })
            });

            const data = await response.json();

            if (data.success && data.claimed) {

                // تحديث الرصيد
                const pointsElement = document.getElementById("points");

                if (pointsElement) {
                    pointsElement.textContent = data.points;
                }

                dailyRewardMessage.textContent =
                    `🎉 You received ${data.reward} points!`;

                dailyRewardBtn.textContent =
                    "✅ Reward Claimed";

            } else {

                dailyRewardMessage.textContent =
                    "⏰ You already claimed today's reward.";

                dailyRewardBtn.textContent =
                    "✅ Already Claimed";
            }

        } catch (error) {

            console.error("Daily reward error:", error);

            dailyRewardMessage.textContent =
                "❌ Something went wrong. Please try again.";

            dailyRewardBtn.disabled = false;
        }
    });
}
