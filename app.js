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

const profilePhotoClickable = document.getElementById('profile-photo-clickable');
const rulesModal = document.getElementById('rules-modal');
const closeRulesModal = document.getElementById('close-rules-modal');

const userStatusDisplay = document.getElementById('user-status');
const daysInGameDisplay = document.getElementById('days-in-game');
const totalContributedDisplay = document.getElementById('total-contributed');
const userRankDisplay = document.getElementById('user-rank');
const donationsBlock = document.getElementById('donations-block');
const donationsPlaceholder = document.getElementById('donations-placeholder');

const mainView = document.getElementById('main-view');
const mainFooter = document.getElementById('main-footer');
const statsPage = document.getElementById('stats-page');
const ratingPage = document.getElementById('rating-page');
const buttonStats = document.getElementById('button-stats');
const buttonRating = document.getElementById('button-rating');
const backButtons = document.querySelectorAll('.back-button');

// --- TON Connect --- 
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://pfworld.vercel.app/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button-header'
});

// Отображение UI в зависимости от статуса подключения кошелька
function updateUiOnWalletStateChange(wallet) {
    if (wallet) {
        const address = wallet.account.address;
        const userFriendlyAddress = `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
        walletAddressDisplayEl.textContent = userFriendlyAddress;
        userInfoHeaderEl.style.display = 'flex';
        tonConnectButtonHeaderEl.style.display = 'none';
        menuButtonEl.style.display = 'flex';
        donationsPlaceholder.style.display = 'none'; // Скрываем заглушку
        donationsBlock.innerHTML = ''; // Очищаем на случай если там что-то было
        checkDonations(address); // Загружаем донаты и расширенную инфу
    } else {
        walletAddressDisplayEl.textContent = '';
        userInfoHeaderEl.style.display = 'none';
        tonConnectButtonHeaderEl.style.display = 'flex';
        menuButtonEl.style.display = 'none';
        clearAllInfo(); // Очищаем всю информацию при отвязке
        donationsPlaceholder.style.display = 'block'; // Показываем заглушку
    }
}

// Отображение Username и другой информации о пользователе Telegram
function displayTelegramUserInfo() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        usernameDisplayEl.textContent = user.username ? `@${user.username}` : `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;
    } else {
        usernameDisplayEl.textContent = 'User';
    }
    shortInfoEl.textContent = 'Инфо (блок 7)'; 
    playGameBtn.innerHTML = '🎮'; 
}

// Подписываемся на изменения статуса подключения кошелька
tonConnectUI.onStatusChange(updateUiOnWalletStateChange);

// Функции для работы с донатами (в целом без изменений, кроме вызова)
async function checkDonations(walletAddress) {
    if (!walletAddress) {
        console.log('Wallet address is not set.');
        donationsBlock.innerHTML = '<p>Адрес кошелька не установлен.</p>';
        return;
    }
    // donationsBlock.innerHTML = '<p>Загрузка донатов...</p>'; // Убираем, т.к. блок должен быть пустым

    try {
        const response = await fetch(`https://tonapi.io/v2/blockchain/accounts/${walletAddress}/transactions?limit=1000`, {
            headers: {
                'Authorization': 'Bearer AFRZNCR5WAER3PAAAAAK3QMOTEGWUDBAQHM6ENRCKMLK4GCPEKP2O362SZ4LGWIXAO7Q5PI'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const transactions = data.transactions || [];
        
        let totalDonation = 0;
        const targetWallet = "0:89377d334e77ab890981dd864838594dc9fab1d1d7767551c83240621b627b6a".toLowerCase(); // Адрес целевого кошелька
        let firstDonationDate = null;

        transactions.forEach(tx => {
            if (tx.out_msgs) {
                tx.out_msgs.forEach(msg => {
                    if (msg.destination && msg.destination.address.toLowerCase() === targetWallet) {
                        const valueInTon = parseInt(msg.value) / 1000000000;
                        totalDonation += valueInTon;
                        if (!firstDonationDate || tx.utime < firstDonationDate) {
                            firstDonationDate = tx.utime;
                        }
                    }
                });
            }
        });

        // donationsBlock теперь пустой, информация пойдет в short-info-area
        updateExtendedInfo(transactions, totalDonation, firstDonationDate);

    } catch (error) {
        console.error('Error fetching donations:', error);
        donationsBlock.innerHTML = '<p>Ошибка при загрузке донатов.</p>';
         updateExtendedInfo([], 0, null); // Обновляем инфо с нулевыми значениями при ошибке
    }
}

function getStatus(totalDonation) {
    if (totalDonation <= 0.3) return "Новенький";
    if (totalDonation <= 5) return "Осваиваюсь";
    if (totalDonation <= 50) return "Набираю обороты";
    if (totalDonation <= 200) return "Серьёзный инвестор";
    if (totalDonation <= 500) return "Вип-меценат";
    if (totalDonation <= 1000) return "ТОНовый магнат";
    return "Босс TON-вселенной";
}

function getDaysInGame(firstTransactionTimestamp) {
    if (!firstTransactionTimestamp) return '...';
    const firstDate = new Date(firstTransactionTimestamp * 1000);
    const today = new Date();
    const diffTime = Math.abs(today - firstDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function updateExtendedInfo(transactions, totalDonation, firstDonationTimestamp) {
    userStatusDisplay.textContent = getStatus(totalDonation);
    daysInGameDisplay.textContent = getDaysInGame(firstDonationTimestamp);
    totalContributedDisplay.textContent = totalDonation.toFixed(2);
    userRankDisplay.textContent = 'N/A (нет данных)'; // Заглушка для рейтинга
    
    // Если кошелек не подключен или нет донатов, в donationsBlock будет заглушка
    if (!tonConnectUI.wallet) {
         donationsPlaceholder.style.display = 'block';
         donationsBlock.innerHTML = '';
    } else if (transactions.length === 0 && totalDonation === 0) {
        donationsBlock.innerHTML = '<p>Донаты не найдены.</p>';
        donationsPlaceholder.style.display = 'none';
    } else {
        donationsBlock.innerHTML = ''; // Оставляем пустым согласно требованию
        donationsPlaceholder.style.display = 'none';
    }
}

// Управление всплывающим меню
menuButtonEl.addEventListener('click', () => {
    popupMenuEl.style.display = 'flex';
});

closeMenuButtonEl.addEventListener('click', () => {
    popupMenuEl.style.display = 'none';
});

disconnectWalletButtonEl.addEventListener('click', () => {
    tonConnectUI.disconnect();
    popupMenuEl.style.display = 'none';
});

// Обработчики событий для кастомных кнопок
customButton1.addEventListener('click', () => console.log('Custom Button 1 (Кнопка 5) clicked'));
customButton2.addEventListener('click', () => console.log('Custom Button 2 (Кнопка 6) clicked'));
playGameBtn.addEventListener('click', () => tg.openTelegramLink(PANDAFIT_GAME_URL));

// --- Отображение Views ---
function showView(viewId) {
    mainView.style.display = 'none';
    mainFooter.style.display = 'none';
    statsPage.style.display = 'none';
    ratingPage.style.display = 'none';

    const viewToShow = document.getElementById(viewId);
    if (viewToShow) {
        viewToShow.style.display = 'flex'; // или 'block' в зависимости от page-view CSS
        if (viewId === 'main-view') {
             mainFooter.style.display = 'flex';
        }
    }
}

buttonStats.addEventListener('click', () => showView('stats-page'));
buttonRating.addEventListener('click', () => showView('rating-page'));
backButtons.forEach(button => {
    button.addEventListener('click', () => showView(button.dataset.target));
});

// --- Модальное окно правил ---
profilePhotoClickable.addEventListener('click', () => {
    rulesModal.style.display = 'flex';
});
closeRulesModal.addEventListener('click', () => {
    rulesModal.style.display = 'none';
});
rulesModal.addEventListener('click', (event) => { // Закрытие по клику на фон
    if (event.target === rulesModal) {
        rulesModal.style.display = 'none';
    }
});

// --- Меню пользователя ---
popupMenuEl.addEventListener('click', (event) => { // Закрытие по клику на фон
    if (event.target === popupMenuEl) {
        popupMenuEl.style.display = 'none';
    }
});

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    displayTelegramUserInfo();
    // Проверка, был ли кошелек восстановлен (например, после перезагрузки страницы)
    tonConnectUI.connectionRestored.then(restored => {
        if (restored) {
            updateUiOnWalletStateChange(tonConnectUI.wallet);
            console.log('Connection restored.');
        } else {
            console.log('Connection not restored or new session.');
            updateUiOnWalletStateChange(null); // Убедимся что UI обновлен для состояния без кошелька
        }
    });
});

function clearAllInfo() {
    userStatusDisplay.textContent = '...';
    daysInGameDisplay.textContent = '...';
    totalContributedDisplay.textContent = '...';
    userRankDisplay.textContent = '...';
    donationsBlock.innerHTML = ''; // Очищаем блок донатов (бывшая месячная разбивка)
    donationsPlaceholder.style.display = 'block';
} 