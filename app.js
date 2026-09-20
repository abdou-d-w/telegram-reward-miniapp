const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const telegramUser = tg.initDataUnsafe?.user;

// ==============================
// Telegram User
// ==============================

async function loadUser() {

    if (!telegramUser) {
        document.getElementById("username").textContent = "Telegram User";
        return;
    }

    // Name
    document.getElementById("username").textContent =
        telegramUser.first_name ||
        telegramUser.username ||
        "Telegram User";

    // Profile image
    if (telegramUser.photo_url) {
        document.getElementById("avatar").innerHTML = `
            <img src="${telegramUser.photo_url}" alt="Profile">
        `;
    }

    // Get user from server
    try {

        const response = await fetch("/api/user", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
       body: JSON.stringify({
    initData: tg.initData,
    startParam: tg.initDataUnsafe?.start_param || ""
})
        });

        const data = await response.json();

        console.log("User API:", data);

        if (data.success && data.user) {

            document.getElementById("username").textContent =
                data.user.display_name ||
                telegramUser.first_name ||
                telegramUser.username ||
                "Telegram User";

            const pointsElement =
                document.getElementById("points");

            if (pointsElement) {
                pointsElement.textContent =
                    data.user.points || 0;
            }
        }

    } catch (error) {

        console.error("User loading error:", error);
    }
}

// ==============================
// Daily Reward
// ==============================

function setupDailyReward() {

    const button =
        document.getElementById("dailyRewardBtn");

    const message =
        document.getElementById("dailyRewardMessage");

    // Check that button exists
    if (!button) {
        console.error("dailyRewardBtn not found");
        return;
    }

    button.addEventListener("click", async () => {

        console.log("Daily reward button clicked");

        button.disabled = true;
        button.textContent = "⏳ Claiming...";

        if (message) {
            message.textContent = "Processing...";
        }

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

            console.log("Daily Reward API:", data);

            // Successful claim
            if (data.success && data.claimed) {

                const pointsElement =
                    document.getElementById("points");

                if (pointsElement) {
                    pointsElement.textContent = data.points;
                }

                button.textContent = "✅ Reward Claimed";

                if (message) {
                    message.textContent =
                        `🎉 +${data.reward} points added!`;
                }

                tg.showAlert(
                    `🎉 Congratulations!\n\nYou received ${data.reward} points!`
                );

                return;
            }

            // Already claimed
            button.textContent = "✅ Already Claimed";

            if (message) {
                message.textContent =
                    "⏰ You already claimed today's reward.";
            }

            tg.showAlert(
                "⏰ You already claimed today's reward."
            );

        } catch (error) {

            console.error("Daily reward error:", error);

            button.disabled = false;
            button.textContent = "🎁 Claim Daily Reward";

            if (message) {
                message.textContent =
                    "❌ Something went wrong.";
            }

            tg.showAlert(
                "❌ Something went wrong. Please try again."
            );
        }
    });
}

// ==============================
// Start
// ==============================

document.addEventListener("DOMContentLoaded", () => {

    loadUser();
    setupDailyReward();

});
