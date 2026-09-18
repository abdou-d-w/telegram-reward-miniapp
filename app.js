const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();


// Telegram user

const user = tg.initDataUnsafe?.user;

if (user) {

    const name =
        user.first_name ||
        user.username ||
        "Player";

    document.getElementById("username").textContent = name;

}


// Play button

document
    .getElementById("playButton")
    .addEventListener("click", () => {

        tg.showAlert(
            "🎮 Game system coming soon!"
        );

    });


// Rewards

document
    .getElementById("rewards")
    .addEventListener("click", () => {

        tg.showAlert(
            "🎁 Rewards system coming soon!"
        );

    });


// Referral

document
    .getElementById("referral")
    .addEventListener("click", () => {

        tg.showAlert(
            "👥 Referral system coming soon!"
        );

    });


// Leaderboard

document
    .getElementById("leaderboard")
    .addEventListener("click", () => {

        tg.showAlert(
            "🏆 Leaderboard coming soon!"
        );

    });


// Profile

document
    .getElementById("profile")
    .addEventListener("click", () => {

        tg.showAlert(
            "👤 Profile coming soon!"
        );

    });
