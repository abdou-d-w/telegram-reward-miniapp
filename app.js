const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();


// ==============================
// Register Telegram user
// ==============================

async function loadUser() {

    try {

        const initData = tg.initData;

        if (!initData) {

            console.log(
                "Telegram initData is not available"
            );

            return;

        }


        const response = await fetch(
            "/api/user",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    initData: initData
                })
            }
        );


        const data = await response.json();


        if (!data.success) {

            console.error(
                data.message
            );

            return;

        }


        const user = data.user;


        // Username / name

        const displayName =
            user.first_name ||
            user.username ||
            "Player";


        document
            .getElementById("username")
            .textContent = displayName;


        // Points

        document
            .getElementById("balance")
            .textContent = user.points;


        console.log(
            "User loaded successfully:",
            user
        );


    } catch (error) {

        console.error(
            "Failed to load user:",
            error
        );

    }

}


loadUser();


// ==============================
// Play button
// ==============================

document
    .getElementById("playButton")
    .addEventListener("click", () => {

        tg.showAlert(
            "🎮 Game system coming soon!"
        );

    });


// ==============================
// Rewards
// ==============================

document
    .getElementById("rewards")
    .addEventListener("click", () => {

        tg.showAlert(
            "🎁 Rewards system coming soon!"
        );

    });


// ==============================
// Referral
// ==============================

document
    .getElementById("referral")
    .addEventListener("click", () => {

        tg.showAlert(
            "👥 Referral system coming soon!"
        );

    });


// ==============================
// Leaderboard
// ==============================

document
    .getElementById("leaderboard")
    .addEventListener("click", () => {

        tg.showAlert(
            "🏆 Leaderboard coming soon!"
        );

    });


// ==============================
// Profile
// ==============================

document
    .getElementById("profile")
    .addEventListener("click", () => {

        tg.showAlert(
            "👤 Profile coming soon!"
        );

    });
