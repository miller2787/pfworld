// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.BackButton.hide();
tg.enableClosingConfirmation(); // Запрашивать подтверждение при закрытии

// Константы
const TARGET_WALLET = "0:89377d334e77ab890981dd864838594dc9fab1d1d7767551c83240621b627b6a";
const TONAPI_KEY = "AFRZNCR5WAER3PAAAAAK3QMOTEGWUDBAQHM6ENRCKMLK4GCPEKP2O362SZ4LGWIXAO7Q5PI";
const PANDAFIT_GAME_URL = "https://t.me/PandaFiT_bot/PandaFiT?startapp=rId444104761";

// DOM элементы
const headerWalletAreaEl = document.getElementById('header-wallet-area');
const tonConnectButtonHeaderEl = document.getElementById('ton-connect-button-header');
const userInfoHeaderEl = document.getElementById('user-info-header');
const usernameDisplayEl = document.getElementById('username-display');
const walletAddressDisplayEl = document.getElementById('wallet-address-display');
const menuButtonEl = document.getElementById('menu-button');

const profilePhotoEl = document.getElementById('profile-photo');
const shortInfoEl = document.getElementById('short-info');
const donationsInfoEl = document.getElementById('donations-info');

const playGameBtn = document.getElementById('play-game');
const customButton1 = document.getElementById('custom-button-1');
const customButton2 = document.getElementById('custom-button-2');

const popupMenuEl = document.getElementById('popup-menu');
const disconnectWalletButtonEl = document.getElementById('disconnect-wallet-button');
const closeMenuButtonEl = document.getElementById('close-menu-button');

// --- TON Connect --- 
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://pfworld.vercel.app/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button-header',
    actionsConfiguration: {
        twaReturnUrl: `https://t.me/${tg.initDataUnsafe?.bot_username || 'bot'}/${tg.initDataUnsafe?.start_param || 'app'}`
    }
});

// Отображение UI в зависимости от статуса подключения кошелька
function updateUiOnWalletStateChange(isConnected, friendlyAddress = null) {
    if (isConnected && friendlyAddress) {
        tonConnectButtonHeaderEl.style.display = 'none';
        userInfoHeaderEl.style.display = 'flex';
        walletAddressDisplayEl.textContent = `${friendlyAddress.slice(0, 4)}...${friendlyAddress.slice(-4)}`;
    } else {
        tonConnectButtonHeaderEl.style.display = 'flex'; // Показываем кнопку TON Connect
        userInfoHeaderEl.style.display = 'none';
        walletAddressDisplayEl.textContent = '';
        donationsInfoEl.innerHTML = '<p>Подключите кошелек для просмотра донатов.</p>';
    }
}

// Отображение Username и другой информации о пользователе Telegram
function displayTelegramUserInfo() {
    const user = tg.initDataUnsafe?.user;
    if (user) {
        usernameDisplayEl.textContent = user.username ? `@${user.username}` : `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;
        profilePhotoEl.textContent = 'ФОТО'; // Заглушка
    } else {
        usernameDisplayEl.textContent = 'Пользователь';
        profilePhotoEl.textContent = 'ФОТО';
    }
    shortInfoEl.textContent = 'Инфо (блок 7)'; 
    playGameBtn.innerHTML = '🎮'; 
}

// Подписываемся на изменения статуса подключения кошелька
tonConnectUI.onStatusChange(async walletAndAccount => {
    if (walletAndAccount) {
        const friendlyAddress = TON_CONNECT_UI.toUserFriendlyAddress(walletAndAccount.account.address, walletAndAccount.account.chain === TON_CONNECT_UI.CHAIN.TESTNET);
        localStorage.setItem('wallet', friendlyAddress);
        updateUiOnWalletStateChange(true, friendlyAddress);
        tg.sendData(JSON.stringify({ wallet: friendlyAddress })); 
        console.log('Кошелек подключен:', friendlyAddress);
        await checkDonations();
    } else {
        localStorage.removeItem('wallet');
        updateUiOnWalletStateChange(false);
        console.log('Кошелек отключен.');
    }
});

// Функции для работы с донатами (в целом без изменений, кроме вызова)
async function checkDonations() {
    const wallet = localStorage.getItem('wallet');
    if (!wallet) {
        donationsInfoEl.innerHTML = '<p>Для проверки донатов необходимо подключить кошелек.</p>';
        return;
    }
    donationsInfoEl.innerHTML = '<p><small>Загрузка данных о донатах...</small></p>';
    try {
        const response = await fetch(`https://tonapi.io/v2/blockchain/accounts/${wallet}/transactions?limit=200`, {
            headers: { 'Authorization': `Bearer ${TONAPI_KEY}` }
        });
        if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
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
                    if (isNaN(value)) return;
                    const date = new Date(tx.utime * 1000);
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    total += value;
                    monthly[monthKey] = (monthly[monthKey] || 0) + value;
                }
            });
        });
        displayDonations(total, monthly);
    } catch (error) {
        donationsInfoEl.innerHTML = '<p><small>Ошибка при получении данных о донатах.</small></p>';
        console.error('Error checking donations:', error);
    }
}

function displayDonations(total, monthly, noTransactions = false) {
    const monthNames = {
        '01': 'Янв', '02': 'Фев', '03': 'Мар', '04': 'Апр',
        '05': 'Май', '06': 'Июн', '07': 'Июл', '08': 'Авг',
        '09': 'Сен', '10': 'Окт', '11': 'Ноя', '12': 'Дек'
    };
    if (noTransactions && total === 0) {
        donationsInfoEl.innerHTML = '<p>Донаты не найдены.</p>';
        return;
    }
    let html = `<p>Общий донат: <b>${total.toFixed(2)} TON</b></p>`;
    if (Object.keys(monthly).length > 0) {
      html += '<h3>По месяцам:</h3>';
      Object.entries(monthly)
          .sort(([a], [b]) => b.localeCompare(a)) // Сортировка по убыванию даты
          .forEach(([month, amount]) => {
              const [year, monthNum] = month.split('-');
              html += `<p><small>${year} ${monthNames[monthNum]} — ${amount.toFixed(2)} TON</small></p>`;
          });
    } else if (total > 0) {
      // html += '<p><small>Детализация по месяцам недоступна.</small></p>';
    } else {
      html += '<p>Донаты не найдены.</p>';
    }
    donationsInfoEl.innerHTML = html;
}

// Управление всплывающим меню
menuButtonEl.addEventListener('click', () => {
    popupMenuEl.style.display = 'flex';
});

closeMenuButtonEl.addEventListener('click', () => {
    popupMenuEl.style.display = 'none';
});

disconnectWalletButtonEl.addEventListener('click', async () => {
    await tonConnectUI.disconnect(); // Отключаем кошелек через TON Connect
    popupMenuEl.style.display = 'none';
    // onStatusChange будет вызван автоматически и обновит UI
    console.log('Команда на отключение кошелька отправлена.');
});

// Обработчики событий для кастомных кнопок
customButton1.addEventListener('click', () => console.log('Custom Button 1 (Кнопка 5) clicked'));
customButton2.addEventListener('click', () => console.log('Custom Button 2 (Кнопка 6) clicked'));
playGameBtn.addEventListener('click', () => tg.openTelegramLink(PANDAFIT_GAME_URL));

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    tg.ready();
    displayTelegramUserInfo();
    // Попытка восстановить предыдущее состояние кошелька
    const wasConnected = await tonConnectUI.connectionRestored;
    if (wasConnected) {
        console.log('Соединение с кошельком восстановлено', tonConnectUI.wallet);
        if (tonConnectUI.wallet) {
            const friendlyAddress = TON_CONNECT_UI.toUserFriendlyAddress(tonConnectUI.wallet.account.address, tonConnectUI.wallet.account.chain === TON_CONNECT_UI.CHAIN.TESTNET);
            updateUiOnWalletStateChange(true, friendlyAddress);
            localStorage.setItem('wallet', friendlyAddress); // Убедимся, что в LS есть адрес
            await checkDonations();
        } else {
             updateUiOnWalletStateChange(false);
        }
    } else {
        console.log('Соединение с кошельком НЕ восстановлено, показываем кнопку подключения.');
        updateUiOnWalletStateChange(false);
    }
}); 