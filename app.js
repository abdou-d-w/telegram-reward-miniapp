const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const telegramUser = tg.initDataUnsafe?.user;

if (telegramUser) {

    document.getElementById("username").textContent =
        telegramUser.first_name ||
        telegramUser.username ||
        "Telegram User";

    tg.showAlert(
        "Telegram user detected: " +
        (telegramUser.first_name || "No first name")
    );

} else {

    document.getElementById("username").textContent =
        "NO TELEGRAM USER";

    tg.showAlert(
        "Telegram user data was not detected."
    );
}
