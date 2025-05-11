// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// Константы
const TARGET_WALLET = "0:89377d334e77ab890981dd864838594dc9fab1d1d7767551c83240621b627b6a";
const TONAPI_KEY = "AFRZNCR5WAER3PAAAAAK3QMOTEGWUDBAQHM6ENRCKMLK4GCPEKP2O362SZ4LGWIXAO7Q5PI";

// DOM элементы
const walletInfoEl = document.getElementById('wallet-info');
const donationsInfoEl = document.getElementById('donations-info');
const playGameBtn = document.getElementById('play-game');

// --- TON Connect --- 
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://pfworld.vercel.app/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button'
});

// Подписываемся на изменения статуса подключения
tonConnectUI.onStatusChange(async walletAndAccount => {
    if (walletAndAccount) {
        const friendlyAddress = TON_CONNECT_UI.toUserFriendlyAddress(walletAndAccount.account.address, walletAndAccount.account.chain === TON_CONNECT_UI.CHAIN.TESTNET);
        console.log('Кошелек подключен:', friendlyAddress);
        localStorage.setItem('wallet', friendlyAddress);
        
        tg.sendData(JSON.stringify({ wallet: friendlyAddress }));
        console.log('Кошелек успешно подключен и сохранен!');
        
        await checkDonations(); 
    } else {
        localStorage.removeItem('wallet');
        donationsInfoEl.innerHTML = '<p>Подключите кошелек для просмотра донатов.</p>';
        console.log('Кошелек отключен.');
    }
});

// Функции для работы с донатами
async function checkDonations() {
    const wallet = localStorage.getItem('wallet');
    if (!wallet) {
        donationsInfoEl.innerHTML = '<p>Для проверки донатов необходимо подключить кошелек.</p>';
        console.log('Попытка проверить донаты без подключенного кошелька.');
        return;
    }
    donationsInfoEl.innerHTML = '<p>Загрузка данных о донатах...</p>';
    try {
        const response = await fetch(`https://tonapi.io/v2/blockchain/accounts/${wallet}/transactions?limit=200`, {
            headers: { 'Authorization': `Bearer ${TONAPI_KEY}` }
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
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
    let html = `<p>Общий донат: ${total.toFixed(2)} TON</p>`;
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
      html += '<p>Донаты не найдены.</p>';
    }
    donationsInfoEl.innerHTML = html;
}

// Обработчики событий
playGameBtn.addEventListener('click', () => {
    tg.openTelegramLink('https://t.me/PandaFiT_bot/PandaFiT?startapp=rId444104761');
});

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // TonConnectUI сам попытается восстановить сессию и вызовет onStatusChange
    // Начальное состояние блока донатов уже установлено в HTML
}); 