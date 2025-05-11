// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// Константы
const TARGET_WALLET = "0:89377d334e77ab890981dd864838594dc9fab1d1d7767551c83240621b627b6a";
const TONAPI_KEY = "AFRZNCR5WAER3PAAAAAK3QMOTEGWUDBAQHM6ENRCKMLK4GCPEKP2O362SZ4LGWIXAO7Q5PI";

// DOM элементы
const walletInfo = document.getElementById('wallet-info');
const donationsInfo = document.getElementById('donations-info');
const setWalletBtn = document.getElementById('set-wallet');
const checkDonationsBtn = document.getElementById('check-donations');
const playGameBtn = document.getElementById('play-game');

// Функции для работы с кошельком
async function setWallet() {
    const wallet = await tg.showPopup({
        title: 'Введите адрес кошелька',
        message: 'Введите адрес вашего TON кошелька (UQ... или EQ...):',
        buttons: [
            {id: 'cancel', type: 'cancel'},
            {id: 'ok', type: 'ok'}
        ]
    });

    if (wallet && wallet.startsWith(('UQ', 'EQ')) && wallet.length >= 24) {
        // Сохраняем кошелек
        localStorage.setItem('wallet', wallet);
        updateWalletInfo(wallet);
        tg.showAlert('Кошелек успешно сохранен!');
    } else {
        tg.showAlert('Неверный формат кошелька');
    }
}

function updateWalletInfo(wallet) {
    if (wallet) {
        const last5 = wallet.slice(-5);
        walletInfo.innerHTML = `<p>Привязанный кошелек: ...${last5}</p>`;
    } else {
        walletInfo.innerHTML = '<p>Кошелек не привязан</p>';
    }
}

// Функции для работы с донатами
async function checkDonations() {
    const wallet = localStorage.getItem('wallet');
    if (!wallet) {
        tg.showAlert('Сначала установите кошелек');
        return;
    }

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
        console.error('Error:', error);
    }
}

function displayDonations(total, monthly) {
    const monthNames = {
        '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
        '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
        '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
    };

    let html = `<p>Общий донат: ${total.toFixed(2)} TON</p>`;
    html += '<h3>Донаты по месяцам:</h3>';
    
    Object.entries(monthly)
        .sort(([a], [b]) => b.localeCompare(a))
        .forEach(([month, amount]) => {
            const [year, monthNum] = month.split('-');
            html += `<p>${year} ${monthNames[monthNum]} — ${amount.toFixed(2)} TON</p>`;
        });

    donationsInfo.innerHTML = html;
}

// Обработчики событий
setWalletBtn.addEventListener('click', setWallet);
checkDonationsBtn.addEventListener('click', checkDonations);
playGameBtn.addEventListener('click', () => {
    tg.openTelegramLink('https://t.me/PandaFiT_bot/PandaFiT?startapp=rId444104761');
});

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    const savedWallet = localStorage.getItem('wallet');
    updateWalletInfo(savedWallet);
}); 