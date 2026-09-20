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
