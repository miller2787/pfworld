// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// Константы
const TARGET_WALLET = "0:89377d334e77ab890981dd864838594dc9fab1d1d7767551c83240621b627b6a";
const TONAPI_KEY = "AFRZNCR5WAER3PAAAAAK3QMOTEGWUDBAQHM6ENRCKMLK4GCPEKP2O362SZ4LGWIXAO7Q5PI";

// DOM элементы
const walletInfoEl = document.getElementById('wallet-info');
const donationsInfo = document.getElementById('donations-info');
const checkDonationsBtn = document.getElementById('check-donations');
const playGameBtn = document.getElementById('play-game');

// --- TON Connect --- 
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://pfworld.vercel.app/tonconnect-manifest.json', // URL вашего манифеста
    buttonRootId: 'ton-connect-button' // ID элемента, куда вставится кнопка
});

// Функция для обновления информации о кошельке в UI
function updateWalletInfo(walletAddress) {
    if (walletAddress) {
        const last5 = walletAddress.slice(-5);
        const first4 = walletAddress.slice(0, 4);
        walletInfoEl.innerHTML = `<p>Кошелек: ${first4}...${last5}</p>`;
        // Сохраняем в localStorage для восстановления состояния, если нужно
        localStorage.setItem('wallet', walletAddress);
    } else {
        walletInfoEl.innerHTML = '<p>Кошелек не привязан</p>';
        localStorage.removeItem('wallet');
    }
}

// Подписываемся на изменения статуса подключения
tonConnectUI.onStatusChange(walletAndAccount => {
    if (walletAndAccount) {
        // walletAndAccount содержит информацию о кошельке и аккаунте
        // Нам нужен адрес в "сыром" виде (0:xxx) или удобном для пользователя (UQxxx/EQxxx)
        // TonConnect обычно возвращает адрес в bounceable/non-bounceable форме (UQ/EQ)
        // и raw виде. Для большинства целей подойдет адрес из walletAndAccount.account.address
        const friendlyAddress = TON_CONNECT_UI.toUserFriendlyAddress(walletAndAccount.account.address, walletAndAccount.account.chain === TON_CONNECT_UI.CHAIN.TESTNET);
        const rawAddress = walletAndAccount.account.address; // Это адрес в формате 0:xxxx

        console.log('Кошелек подключен:', walletAndAccount);
        console.log('Адрес (user friendly):', friendlyAddress);
        console.log('Адрес (raw):', rawAddress);

        updateWalletInfo(friendlyAddress); // Отображаем user-friendly адрес

        // Отправляем "сырой" адрес (0:xxx) боту, если ваш бэкенд ожидает такой формат
        // Если ваш load_wallets и save_user_info ожидают UQ/EQ, отправляйте friendlyAddress
        // Важно: ваш текущий bot.py ожидает UQ/EQ адреса.
        tg.sendData(JSON.stringify({ 
            wallet: friendlyAddress 
        }));
        console.log('Кошелек успешно подключен и сохранен!');
    } else {
        updateWalletInfo(null);
        console.log('Кошелек отключен.');
    }
});

// Функции для работы с донатами
async function checkDonations() {
    const wallet = localStorage.getItem('wallet');
    if (!wallet) {
        console.log('Сначала подключите кошелек через кнопку TON Connect');
        return;
    }
    // Важно: Убедитесь, что API tonapi.io ожидает адрес в том формате, который вы сохраняете (friendlyAddress)
    // Если tonapi.io требует raw-адрес (0:xxx), нужно будет его как-то получить/сконвертировать
    // или передавать raw-адрес при сохранении для этой функции.
    // Сейчас fetch_transactions в bot.py, скорее всего, ожидает UQ/EQ.

    donationsInfo.innerHTML = '<p>Загрузка данных о донатах...</p>';
    
    try {
        const response = await fetch(`https://tonapi.io/v2/blockchain/accounts/${wallet}/transactions?limit=200`, {
            headers: {
                'Authorization': `Bearer ${TONAPI_KEY}`
            }
        });
        
        const data = await response.json();
        const transactions = data.transactions || [];
        
        let total = 0;
        const monthly = {};
        
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
        donationsInfo.innerHTML = '<p>Ошибка при получении данных о донатах</p>';
        console.error('Error checking donations:', error);
    }
}

function displayDonations(total, monthly) {
    const monthNames = {
        '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
        '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
        '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
    };

    let html = `<p>Общий донат: ${total.toFixed(2)} TON</p>`;
    if (Object.keys(monthly).length > 0) {
      html += '<h3>Донаты по месяцам:</h3>';
      Object.entries(monthly)
          .sort(([a], [b]) => b.localeCompare(a))
          .forEach(([month, amount]) => {
              const [year, monthNum] = month.split('-');
              html += `<p>${year} ${monthNames[monthNum]} — ${amount.toFixed(2)} TON</p>`;
          });
    } else {
      html += '<p>Пока нет донатов за выбранный период.</p>';
    }

    donationsInfo.innerHTML = html;
}

// Обработчики событий
checkDonationsBtn.addEventListener('click', checkDonations);
playGameBtn.addEventListener('click', () => {
    tg.openTelegramLink('https://t.me/PandaFiT_bot/PandaFiT?startapp=rId444104761');
});

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Пробуем восстановить кошелек из localStorage, если он был подключен ранее
    // TON Connect UI может сам восстанавливать сессию, но для отображения в нашем UI это полезно.
    const savedWallet = localStorage.getItem('wallet');
    if (savedWallet && !tonConnectUI.connected) {
        // Если кошелек сохранен, но TON Connect UI еще не сказал, что он connected,
        // просто отображаем его. TON Connect UI при инициализации сам попробует восстановить соединение.
        updateWalletInfo(savedWallet);
    }
    // Если TON Connect UI уже восстановил соединение, onStatusChange уже должен был вызваться.
}); 