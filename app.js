// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.BackButton.hide(); // Скрываем стандартную кнопку Назад, если она не нужна

// Константы
const TARGET_WALLET = "0:89377d334e77ab890981dd864838594dc9fab1d1d7767551c83240621b627b6a";
const TONAPI_KEY = "AFRZNCR5WAER3PAAAAAK3QMOTEGWUDBAQHM6ENRCKMLK4GCPEKP2O362SZ4LGWIXAO7Q5PI";
const PANDAFIT_GAME_URL = "https://t.me/PandaFiT_bot/PandaFiT?startapp=rId444104761";

// DOM элементы
const usernameDisplayEl = document.getElementById('username-display');
const profilePhotoEl = document.getElementById('profile-photo');
const shortInfoEl = document.getElementById('short-info');
const donationsInfoEl = document.getElementById('donations-info');
const playGameBtn = document.getElementById('play-game');
const customButton1 = document.getElementById('custom-button-1');
const customButton2 = document.getElementById('custom-button-2');

// --- TON Connect --- 
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://pfworld.vercel.app/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button', // ID элемента, куда вставится кнопка
    actionsConfiguration: {
        twaReturnUrl: `https://t.me/${tg.initDataUnsafe.bot_username}/${tg.initDataUnsafe.start_param}`
    }
});

// Отображение Username и другой информации о пользователе Telegram
function displayTelegramUserInfo() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        usernameDisplayEl.textContent = user.username ? `@${user.username}` : `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;
        // profilePhotoEl.style.backgroundImage = `url(${user.photo_url})`; // Если есть photo_url и хотим его использовать
        // Для начала просто текст
        profilePhotoEl.textContent = 'ФОТО'; 
    } else {
        usernameDisplayEl.textContent = 'User';
        profilePhotoEl.textContent = 'ФОТО';
    }
    // Заглушка для блока 7
    shortInfoEl.textContent = 'Краткая информация (блок 7)';
    // Заглушка для блока 8 (донаты)
    donationsInfoEl.innerHTML = '<p>Подключите кошелек для просмотра донатов.</p>';
    // Заглушка (иконка) для кнопки игры
    playGameBtn.innerHTML = '🎮'; // Используем только иконку, текст удален из HTML

}

// Подписываемся на изменения статуса подключения кошелька
tonConnectUI.onStatusChange(async walletAndAccount => {
    if (walletAndAccount) {
        const friendlyAddress = TON_CONNECT_UI.toUserFriendlyAddress(walletAndAccount.account.address, walletAndAccount.account.chain === TON_CONNECT_UI.CHAIN.TESTNET);
        console.log('Кошелек подключен:', friendlyAddress);
        localStorage.setItem('wallet', friendlyAddress);
        tg.sendData(JSON.stringify({ wallet: friendlyAddress })); // Отправляем боту
        console.log('Кошелек успешно подключен и сохранен в LS!');
        await checkDonations();
    } else {
        localStorage.removeItem('wallet');
        donationsInfoEl.innerHTML = '<p>Подключите кошелек для просмотра донатов.</p>';
        console.log('Кошелек отключен.');
    }
});

// Функции для работы с донатами (остается как есть, но теперь вызывается автоматически)
async function checkDonations() {
    const wallet = localStorage.getItem('wallet');
    if (!wallet) {
        donationsInfoEl.innerHTML = '<p>Для проверки донатов необходимо подключить кошелек.</p>';
        return;
    }
    donationsInfoEl.innerHTML = '<p>Загрузка данных о донатах...</p>';
    try {
        const response = await fetch(`https://tonapi.io/v2/blockchain/accounts/${wallet}/transactions?limit=200`, {
            headers: { 'Authorization': `Bearer ${TONAPI_KEY}` }
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        const transactions = data.transactions || [];
        let total = 0;
        const monthly = {};
        if (transactions.length === 0) {
            displayDonations(total, monthly, true);
            return;
        }
        transactions.forEach(tx => {
            tx.out_msgs?.forEach(msg => {
                if (msg.destination?.address === TARGET_WALLET) {
                    const value = parseInt(msg.value) / 1e9;
                    const date = new Date(tx.utime * 1000);
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    total += value;
                    monthly[monthKey] = (monthly[monthKey] || 0) + value;
                }
            });
        });
        displayDonations(total, monthly);
    } catch (error) {
        donationsInfoEl.innerHTML = '<p>Ошибка при получении данных о донатах. Попробуйте позже.</p>';
        console.error('Error checking donations:', error);
    }
}

function displayDonations(total, monthly, noTransactions = false) {
    const monthNames = {
        '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
        '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
        '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
    };
    if (noTransactions && total === 0) {
        donationsInfoEl.innerHTML = '<p>Донаты не найдены для этого кошелька.</p>';
        return;
    }
    let html = `<p>Общий донат: <b>${total.toFixed(2)} TON</b></p>`;
    if (Object.keys(monthly).length > 0) {
      html += '<h3>Донаты по месяцам:</h3>';
      Object.entries(monthly)
          .sort(([a], [b]) => b.localeCompare(a))
          .forEach(([month, amount]) => {
              const [year, monthNum] = month.split('-');
              html += `<p>${year} ${monthNames[monthNum]} — ${amount.toFixed(2)} TON</p>`;
          });
    } else if (total > 0) {
      html += '<p>Детализация по месяцам недоступна.</p>';
    } else {
      html += '<p>Донаты не найдены.</p>'; // Если total 0 и не было флага noTransactions
    }
    donationsInfoEl.innerHTML = html;
}

// Обработчики событий для новых кнопок (пока просто логи в консоль)
customButton1.addEventListener('click', () => console.log('Custom Button 1 (Кнопка 5) clicked'));
customButton2.addEventListener('click', () => console.log('Custom Button 2 (Кнопка 6) clicked'));

playGameBtn.addEventListener('click', () => {
    tg.openTelegramLink(PANDAFIT_GAME_URL);
});

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    tg.ready(); // Сообщаем Telegram, что приложение готово
    displayTelegramUserInfo();
    // TonConnectUI сам попытается восстановить сессию и вызовет onStatusChange,
    // который в свою очередь вызовет checkDonations при успешном подключении.
}); 