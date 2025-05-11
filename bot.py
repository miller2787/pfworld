import logging
import requests
import datetime
import sys
import time
import json
from pathlib import Path
from collections import defaultdict

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import (
    Message, CallbackQuery,
    InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
)
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.exceptions import TelegramBadRequest

# === CONFIG ===
BOT_TOKEN     = "7718463418:AAG_IlDbySk195-zZQAwyWftsF1y-rPGVug"
TONAPI_KEY    = "AFRZNCR5WAER3PAAAAAK3QMOTEGWUDBAQHM6ENRCKMLK4GCPEKP2O362SZ4LGWIXAO7Q5PI"
TARGET_WALLET = "0:89377d334e77ab890981dd864838594dc9fab1d1d7767551c83240621b627b6a"
API_BASE      = "https://tonapi.io/v2/blockchain/accounts"
WALLETS_FILE  = "wallets.json"
ALL_MSGS_FILE = "all_msgs.json"
PANDAFIT_URL = "https://t.me/PandaFiT_bot/PandaFiT?startapp=rId444104761"

# === LOGGING ===
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("transaction.log", mode="a", encoding="utf-8")
    ]
)
logger = logging.getLogger(__name__)

# === WALLET STORAGE & USER INFO ===
def load_wallets():
    if Path(WALLETS_FILE).exists():
        with open(WALLETS_FILE, 'r') as f:
            wallets = json.load(f)
        # Migrate old string format to new dict format
        changed = False
        for k, v in list(wallets.items()):
            if isinstance(v, str):
                wallets[k] = {
                    "user_id": int(k),
                    "username": "",
                    "linked_wallet_address": v,
                    "is_bot": False
                }
                changed = True
        if changed:
            with open(WALLETS_FILE, 'w') as f:
                json.dump(wallets, f, ensure_ascii=False, indent=2)
        return wallets
    return {}

def save_user_info(user_id: int, username: str, is_bot: bool, wallet: str = None):
    wallets = load_wallets()
    record = wallets.get(str(user_id), {})
    record["user_id"] = user_id
    record["username"] = username or ""
    record["is_bot"] = is_bot
    if wallet is not None:
        record["linked_wallet_address"] = wallet
    elif "linked_wallet_address" in record:
        del record["linked_wallet_address"]  # Полностью удаляем кошелек при отвязке
    wallets[str(user_id)] = record
    with open(WALLETS_FILE, 'w') as f:
        json.dump(wallets, f, ensure_ascii=False, indent=2)

def get_wallet(user_id: int):
    wallets = load_wallets()
    return wallets.get(str(user_id))

def has_welcome(user_id):
    wallets = load_wallets()
    record = wallets.get(str(user_id), {})
    return record.get("welcome_sent", False)

def set_welcome(user_id):
    wallets = load_wallets()
    record = wallets.get(str(user_id), {})
    record["welcome_sent"] = True
    wallets[str(user_id)] = record
    with open(WALLETS_FILE, 'w') as f:
        json.dump(wallets, f, ensure_ascii=False, indent=2)

# New functions to save and retrieve welcome_msg_id
def set_welcome_msg_id(user_id, msg_id):
    wallets = load_wallets()
    record = wallets.get(str(user_id), {})
    record["welcome_msg_id"] = msg_id
    wallets[str(user_id)] = record
    with open(WALLETS_FILE, 'w') as f:
        json.dump(wallets, f, ensure_ascii=False, indent=2)

def get_welcome_msg_id(user_id):
    wallets = load_wallets()
    record = wallets.get(str(user_id), {})
    return record.get("welcome_msg_id")

# === MESSAGE HISTORY STORAGE ===
def load_all_msgs():
    if Path(ALL_MSGS_FILE).exists():
        with open(ALL_MSGS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_all_msgs(msgs):
    with open(ALL_MSGS_FILE, 'w') as f:
        json.dump(msgs, f)

async def delete_all_history(bot, user_id, chat_id):
    msgs = load_all_msgs()
    ids = msgs.get(str(user_id), [])
    welcome_msg_id = get_welcome_msg_id(user_id)
    
    # Удаляем все сообщения, кроме приветственного
    for msg_id in ids:
        if msg_id != welcome_msg_id:  # Пропускаем приветственное сообщение
            try:
                await bot.delete_message(chat_id, msg_id)
            except TelegramBadRequest:
                pass
    
    # Сохраняем только ID приветственного сообщения
    if welcome_msg_id:
        msgs[str(user_id)] = [welcome_msg_id]
    else:
        msgs[str(user_id)] = []
    save_all_msgs(msgs)

def add_msg_id(user_id, msg_id):
    msgs = load_all_msgs()
    ids = msgs.get(str(user_id), [])
    ids.append(msg_id)
    msgs[str(user_id)] = ids
    save_all_msgs(msgs)

# === MESSAGE FORMATTING ===
def get_full_width_text(text: str) -> str:
    # Просто выделяем каждую непустую строку жирным, без невидимых символов
    lines = text.splitlines()
    res = []
    for line in lines:
        stripped = line.rstrip()
        if stripped:
            res.append(f"<b>{stripped}</b>")
        else:
            res.append("")
    return "\n".join(res)

# === INLINE KEYBOARDS ===
# Генерация максимально широкой кнопки PandaFit
def get_pandafit_button():
    max_len = 34  # Telegram limit for button text
    text = "🎮 Играть в PandaFit"
    invisible = "⠀"  # U+2800
    pad = max_len - len(text)
    left = pad // 2
    right = pad - left
    wide_text = f"{invisible * left}{text}{invisible * right}"
    return InlineKeyboardButton(text=wide_text, url=PANDAFIT_URL)

def get_main_inline_keyboard(user_id: int) -> InlineKeyboardMarkup:
    wallet_info = get_wallet(user_id)
    buttons = [
        [InlineKeyboardButton(text="💰 Проверить донаты", callback_data="check_donation")]
    ]
    if wallet_info and wallet_info.get("linked_wallet_address"):
        last5 = wallet_info["linked_wallet_address"][-5:]
        btn_text = f"💳 ...{last5} (Отвязать кошелёк)"
        buttons.append([InlineKeyboardButton(text=btn_text, callback_data="wallet_menu")])
    else:
        buttons.append([InlineKeyboardButton(text="💳 Установить кошелек", callback_data="set_wallet")])
    
    # Добавляем кнопку мини-приложения
    buttons.append([InlineKeyboardButton(
        text="🎮 Открыть приложение",
        web_app=WebAppInfo(url="https://your-app-url.com")  # Замените на URL вашего приложения
    )])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_unlink_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Оставить", callback_data="keep_wallet")],
        [InlineKeyboardButton(text="❌ Отвязать кошелек", callback_data="unlink_wallet")],
        [InlineKeyboardButton(text="🏠 На главную", callback_data="home")],
        [get_pandafit_button()]
    ])

def get_home_keyboard(user_id: int) -> InlineKeyboardMarkup:
    return get_main_inline_keyboard(user_id)

# Для временных клавиатур (например, при ошибке или вводе кошелька) используем такую функцию:
def get_temp_keyboard(include_home=True):
    buttons = []
    if include_home:
        buttons.append([InlineKeyboardButton(text="🏠 На главную", callback_data="home")])
    buttons.append([get_pandafit_button()])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

# === FSM STATES ===
class WalletStates(StatesGroup):
    waiting_for_wallet = State()

# === TRANSACTION FETCHING ===
def fetch_transactions(sender: str):
    headers = {"Authorization": f"Bearer {TONAPI_KEY}"}
    base_url = f"{API_BASE}/{sender}/transactions"
    all_txs = []
    total_count = 0
    url = f"{base_url}?limit=200"
    cutoff_date = datetime.datetime(2025, 3, 2)
    logger.info(f"Will stop fetching at transactions before {cutoff_date}")

    while True:
        try:
            r = requests.get(url, headers=headers)
            r.raise_for_status()
            j = r.json()
            txs = j.get("transactions", [])
            if not txs:
                logger.info("No more transactions found")
                break

            count = len(txs)
            total_count += count
            logger.info(f"🔄 Загружено {count} транзакций (всего: {total_count})")

            oldest_tx_date = datetime.datetime.fromtimestamp(txs[-1]["utime"])
            if oldest_tx_date < cutoff_date:
                logger.info(f"Reached transactions before {cutoff_date}, stopping fetch")
                txs = [tx for tx in txs if datetime.datetime.fromtimestamp(tx["utime"]) >= cutoff_date]
                all_txs.extend(txs)
                break

            all_txs.extend(txs)
            last_tx = txs[-1]
            lt = last_tx.get("lt")
            if not lt:
                logger.info("No lt found in last transaction")
                break

            url = f"{base_url}?limit=200&before_lt={lt}"
            time.sleep(1)

        except requests.exceptions.RequestException as e:
            logger.error(f"Request error: {str(e)}")
            break
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            break

    logger.info(f"✅ Всего загружено {total_count} транзакций для адреса {sender}")
    return all_txs

# === SOCIALS LINE ===
def get_socials_line():
    base = '<a href="https://t.me/pandafitchat">Чат</a>'
    # Растяжка до ширины строки приветствия (35 символов)
    visible_len = len("Чат")
    pad = len("Добро пожаловать в PandaFit World") - visible_len
    return base + (" " * pad)

# === TON VALUE FORMATTING ===
def format_ton(val):
    s = (f"{val:.6f}").rstrip('0').rstrip('.')
    return s

# === HANDLERS ===

# /start and home
async def cmd_start(message: Message):
    save_user_info(
        message.from_user.id,
        message.from_user.username,
        message.from_user.is_bot,
        get_wallet(message.from_user.id).get("linked_wallet_address") if get_wallet(message.from_user.id) else None
    )
    
    # Всегда отправляем приветственное сообщение при /start
    welcome_msg = await message.answer(
        get_full_width_text("Добро пожаловать в PandaFit World") + "\n" + get_socials_line(),
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    set_welcome(message.from_user.id)
    set_welcome_msg_id(message.from_user.id, welcome_msg.message_id)
    
    # Добавляем ID сообщения пользователя и удаляем историю
    add_msg_id(message.from_user.id, message.message_id)
    await delete_all_history(message.bot, message.from_user.id, message.chat.id)
    
    # Отправляем интерфейс бота
    msg = await message.answer(
        get_full_width_text("👋 Добро пожаловать! Выберите действие:") + "\n" + get_socials_line(),
        reply_markup=get_main_inline_keyboard(message.from_user.id),
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    add_msg_id(message.from_user.id, msg.message_id)

async def cb_home(call: CallbackQuery):
    save_user_info(
        call.from_user.id,
        call.from_user.username,
        call.from_user.is_bot,
        get_wallet(call.from_user.id).get("linked_wallet_address") if get_wallet(call.from_user.id) else None
    )
    await delete_all_history(call.bot, call.from_user.id, call.message.chat.id)
    msg = await call.message.answer(
        get_full_width_text("🏠 Главное меню:") + "\n" + get_socials_line(),
        reply_markup=get_main_inline_keyboard(call.from_user.id),
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    add_msg_id(call.from_user.id, msg.message_id)
    await call.answer()

# Inline: Set Wallet
async def cb_set_wallet(call: CallbackQuery, state: FSMContext):
    save_user_info(
        call.from_user.id,
        call.from_user.username,
        call.from_user.is_bot,
        get_wallet(call.from_user.id).get("linked_wallet_address") if get_wallet(call.from_user.id) else None
    )
    await delete_all_history(call.bot, call.from_user.id, call.message.chat.id)
    keyboard = get_temp_keyboard()
    msg = await call.message.answer(
        get_full_width_text("Пожалуйста, введите адрес вашего TON кошелька (UQ... или EQ...):") + "\n" + get_socials_line(),
        reply_markup=keyboard,
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    add_msg_id(call.from_user.id, msg.message_id)
    await state.set_state(WalletStates.waiting_for_wallet)
    await call.answer()

# Inline: Wallet menu (Unlink)
async def cb_wallet_menu(call: CallbackQuery):
    save_user_info(
        call.from_user.id,
        call.from_user.username,
        call.from_user.is_bot,
        get_wallet(call.from_user.id).get("linked_wallet_address") if get_wallet(call.from_user.id) else None
    )
    await delete_all_history(call.bot, call.from_user.id, call.message.chat.id)
    wallet_info = get_wallet(call.from_user.id)
    last5 = wallet_info["linked_wallet_address"][-5:] if wallet_info and wallet_info.get("linked_wallet_address") else ""
    msg = await call.message.answer(
        get_full_width_text(f"Ваш сохраненный кошелек: ...{last5}\n\nЧто вы хотите сделать?") + "\n" + get_socials_line(),
        reply_markup=get_unlink_keyboard(),
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    add_msg_id(call.from_user.id, msg.message_id)
    await call.answer()

# Inline: Keep wallet
async def cb_keep_wallet(call: CallbackQuery):
    save_user_info(
        call.from_user.id,
        call.from_user.username,
        call.from_user.is_bot,
        get_wallet(call.from_user.id).get("linked_wallet_address") if get_wallet(call.from_user.id) else None
    )
    await delete_all_history(call.bot, call.from_user.id, call.message.chat.id)
    msg = await call.message.answer(
        get_full_width_text("Главное меню:") + "\n" + get_socials_line(),
        reply_markup=get_main_inline_keyboard(call.from_user.id),
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    add_msg_id(call.from_user.id, msg.message_id)
    await call.answer()

# Inline: Unlink wallet
async def cb_unlink_wallet(call: CallbackQuery):
    # Полностью очищаем данные кошелька
    save_user_info(
        call.from_user.id,
        call.from_user.username,
        call.from_user.is_bot,
        None  # Явно передаем None для удаления кошелька
    )
    await delete_all_history(call.bot, call.from_user.id, call.message.chat.id)
    msg = await call.message.answer(
        get_full_width_text("✅ Кошелек успешно отвязан.\n\nГлавное меню:") + "\n" + get_socials_line(),
        reply_markup=get_main_inline_keyboard(call.from_user.id),
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    add_msg_id(call.from_user.id, msg.message_id)
    await call.answer()

# Inline: Check Donation
async def cb_check_donation(call: CallbackQuery):
    save_user_info(
        call.from_user.id,
        call.from_user.username,
        call.from_user.is_bot,
        get_wallet(call.from_user.id).get("linked_wallet_address") if get_wallet(call.from_user.id) else None
    )
    await delete_all_history(call.bot, call.from_user.id, call.message.chat.id)
    wallet_info = get_wallet(call.from_user.id)
    if not wallet_info or not wallet_info.get("linked_wallet_address"):
        keyboard = get_temp_keyboard()
        text = get_full_width_text("❗ Пожалуйста, сначала установите кошелек.") + "\n" + get_socials_line()
        msg = await call.message.answer(
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True
        )
        add_msg_id(call.from_user.id, msg.message_id)
        await call.answer()
        return
    # Show counting message and remember its ID
    counting_msg = await call.message.answer(
        get_full_width_text("🔍 Идёт подсчёт транзакций... это может занять несколько секунд...") + "\n" + get_socials_line(),
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    add_msg_id(call.from_user.id, counting_msg.message_id)
    txs = fetch_transactions(wallet_info["linked_wallet_address"])
    # After calculation, delete the counting message
    try:
        await call.bot.delete_message(call.message.chat.id, counting_msg.message_id)
    except TelegramBadRequest:
        pass

    if txs is None:
        keyboard = get_temp_keyboard()
        text = get_full_width_text("❌ Ошибка при получении транзакций.") + "\n" + get_socials_line()
        msg = await call.message.answer(
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True
        )
        add_msg_id(call.from_user.id, msg.message_id)
        await call.answer()
        return

    total = 0.0
    monthly = {}
    for tx in txs:
        outs = tx.get("out_msgs", [])
        for m in outs:
            dest = m.get("destination")
            dest_address = dest.get("address") if dest else ""
            raw = m.get("value")
            try:
                val = int(raw) / 1e9
            except (ValueError, TypeError):
                continue
            ts = datetime.datetime.fromtimestamp(tx["utime"])
            month_key = ts.strftime("%Y-%m")
            sender_addr = tx.get("account", "")
            if dest_address == f"{TARGET_WALLET}":
                total += val
                monthly[month_key] = monthly.get(month_key, 0) + val
                # Лог только для файла
                if isinstance(sender_addr, dict):
                    sender_addr_str = sender_addr.get("address", "")
                else:
                    sender_addr_str = str(sender_addr)
                log_line = (
                    f"{ts.strftime('%Y-%m-%d %H:%M')} - "
                    f"{sender_addr_str[:48]} - "
                    f"💸 {format_ton(val)} TON -> {dest_address}"
                )
                logger.info(log_line)

    if total == 0:
        keyboard = get_temp_keyboard()
        text = get_full_width_text("🚫 Донаты в PandaFiT не найдены.") + "\n" + get_socials_line()
        msg = await call.message.answer(
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True
        )
        add_msg_id(call.from_user.id, msg.message_id)
    else:
        month_names = {
            "01": "Январь", "02": "Февраль", "03": "Март", "04": "Апрель",
            "05": "Май", "06": "Июнь", "07": "Июль", "08": "Август",
            "09": "Сентябрь", "10": "Октябрь", "11": "Ноябрь", "12": "Декабрь"
        }
        sorted_months = sorted(monthly.items(), reverse=True)
        month_lines = [
            f"{key[:4]} {month_names.get(key[5:], key[5:])} — {format_ton(val)} TON"
            for key, val in sorted_months
        ]
        text = [
            get_full_width_text(f"💰 Ваш общий донат: {format_ton(total)} TON"),
            get_full_width_text("📅 Донаты по месяцам:")
        ]
        text += month_lines
        text = "\n".join(text)
        text += "\n" + get_socials_line()
        # Клавиатура с кнопкой PandaFit
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🏠 На главную", callback_data="home")],
            [get_pandafit_button()]
        ])
        msg = await call.message.answer(
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True
        )
        add_msg_id(call.from_user.id, msg.message_id)
    await call.answer()

# FSM: Wallet input
async def handle_wallet_input(message: Message, state: FSMContext):
    add_msg_id(message.from_user.id, message.message_id)
    await delete_all_history(message.bot, message.from_user.id, message.chat.id)
    wallet = message.text.strip()
    if not wallet.startswith(("UQ", "EQ")) or len(wallet) < 24:
        keyboard = get_temp_keyboard()
        msg = await message.answer(
            get_full_width_text("❗ Неверный формат кошелька. Попробуйте снова:") + "\n" + get_socials_line(),
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True
        )
        add_msg_id(message.from_user.id, msg.message_id)
        return
    save_user_info(
        message.from_user.id,
        message.from_user.username,
        message.from_user.is_bot,
        wallet
    )
    await state.clear()
    msg = await message.answer(
        get_full_width_text("✅ Кошелек сохранен!") + "\n" + get_socials_line(),
        reply_markup=get_main_inline_keyboard(message.from_user.id),
        parse_mode="HTML",
        disable_web_page_preview=True
    )
    add_msg_id(message.from_user.id, msg.message_id)

# === BOT STARTUP ===
if __name__ == "__main__":
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    # Register handlers
    dp.message.register(cmd_start, Command(commands=["start"]))
    dp.callback_query.register(cb_home, F.data == "home")
    dp.callback_query.register(cb_set_wallet, F.data == "set_wallet")
    dp.callback_query.register(cb_wallet_menu, F.data == "wallet_menu")
    dp.callback_query.register(cb_keep_wallet, F.data == "keep_wallet")
    dp.callback_query.register(cb_unlink_wallet, F.data == "unlink_wallet")
    dp.callback_query.register(cb_check_donation, F.data == "check_donation")
    dp.message.register(handle_wallet_input, WalletStates.waiting_for_wallet)

    dp.run_polling(bot)