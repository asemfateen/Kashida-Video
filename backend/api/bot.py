"""
Kashida Video — Telegram Bot (Polling Mode)
Accumulate-model news video generation: users send one or more news rounds
(text + image/video clip), then `/generate` stitches them all into a single
multi-round MP4 with a chosen template (Breaking News, Quote, Economy, Sports).

Usage:
    cd backend && source venv/bin/activate
    python -m api.bot
"""

import asyncio
import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4
from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    MessageHandler,
    filters,
)

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "videos"
ASSET_VID_DIR = Path(__file__).resolve().parent.parent / "data" / "assets" / "video"
ASSET_VID_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_LOOP_PATH = ASSET_VID_DIR / "breaking_loop.mp4"

USER_SESSIONS = {}
USER_TEMPLATES: dict[int, str] = {}
# Accumulate-model: chat_id -> list of pending news rounds awaiting /generate.
PENDING_ROUNDS: dict[int, list[dict]] = {}

from api.templates import list_templates, load_template

DEFAULT_TEMPLATE_ID = "breaking_news"


def _safe_md(text: str, max_len: int = 0) -> str:
    """Sanitize text for Telegram Markdown backtick blocks."""
    cleaned = str(text or "").replace("`", "'")
    if max_len > 0:
        cleaned = cleaned[:max_len]
    return cleaned


def _cleanup_round_media(rounds: list[dict]) -> None:
    """Clean up temporary uploaded media files for given rounds."""
    for r in rounds:
        for media_key in ("videoUrl", "imageUrl"):
            raw_u = r.get(media_key) or ""
            if raw_u.startswith("file://"):
                p = Path(raw_u[len("file://"):])
                if p.exists() and p.name.startswith("tg_"):
                    try:
                        p.unlink(missing_ok=True)
                    except Exception:
                        pass


def _template_exists(tmpl_id: str) -> bool:
    """Whether the template id exists in the unified template store."""
    try:
        return load_template(tmpl_id) is not None
    except Exception:
        return False


def _tmpl_config(tmpl_id: str) -> dict:
    """Resolve template name + design defaults directly from the unified template store.

    Reads the template record (data.accentColor, data.backgroundColor, and labels
    under data.labelAr/labelEn or data.rounds[0]). Falls back to clean defaults if not found.
    """
    rec = None
    try:
        rec = load_template(tmpl_id)
    except Exception:
        pass

    if rec is None and tmpl_id != DEFAULT_TEMPLATE_ID:
        try:
            rec = load_template(DEFAULT_TEMPLATE_ID)
        except Exception:
            pass

    data = rec.data if rec else {}
    rounds = data.get("rounds") or []
    round0 = rounds[0] if rounds else {}

    return {
        "name": (rec.meta.name if rec and rec.meta else None) or data.get("name") or "قالب إخباري",
        "accentColor": (
            data.get("accentColor")
            or round0.get("accentColor")
            or "#e63946"
        ),
        "backgroundColor": (
            data.get("backgroundColor")
            or round0.get("backgroundColor")
            or "#0b0b0f"
        ),
        "labelAr": (
            data.get("labelAr")
            or round0.get("labelAr")
            or "عاجل"
        ),
        "labelEn": (
            data.get("labelEn")
            or round0.get("labelEn")
            or "NEWS"
        ),
        # Bumper config lives on the unified template store (data.bumper). If the
        # template has none (or it is disabled), the renderer sees no bumper.
        "bumper": data.get("bumper"),
    }


def get_all_templates():
    metas = list_templates()
    records = []
    for m in metas:
        rec = load_template(m.id)
        if rec:
            records.append(rec)
    return records


def format_arabic_error(error_detail: object) -> str:
    """Translate system/celery exceptions into clear, friendly Arabic instructions."""
    err_str = str(error_detail).lower()
    if "playwright" in err_str or "chromium" in err_str or "browser" in err_str:
        return "⚠️ تعذر تشغيل محرك الرندرة البصري (Playwright/Chromium). يرجى التأكد من تشغيل بيئة المتصفح على الخادم."
    if "ffmpeg" in err_str or "codec" in err_str or "demuxer" in err_str or "corrupt" in err_str:
        return "⚠️ حدث خطأ أثناء معالجة وترميز مقاطع الفيديو عبر FFmpeg. يرجى التأكد من سلامة صيغة ودقة الوسائط المرفوعة."
    if "redis" in err_str or "connection" in err_str or "broker" in err_str or "worker" in err_str:
        return "⚠️ تعذر الاتصال بمركز معالجة المهام (Redis/Celery). الخدمات الخلفية قيد إعادة التشغيل أو الصيانة."
    if "timeout" in err_str or "timed out" in err_str or "time out" in err_str or "deadline" in err_str:
        return "⏳ استغرقت عملية المعالجة وقتاً أطول من المتوقع وتجاوزت المهلة المحددة (دقيقتان)."
    if "not found" in err_str or "no such file" in err_str:
        return "⚠️ تعذر العثور على ملفات القالب أو ملفات الوسائط اللازمة لإتمام الرندرة."
    clean_detail = str(error_detail).replace('*', '').replace('_', ' ').replace('`', "'")
    return f"❌ تعذر استكمال توليد الفيديو بسبب خطأ غير متوقع: {clean_detail}"


def get_video_duration_seconds(file_path: Path) -> float:
    """Extract actual video duration in seconds via ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(file_path),
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        data = json.loads(res.stdout)
        return float(data.get("format", {}).get("duration", 0.0))
    except Exception:
        return 0.0


def get_main_keyboard():
    """Persistent bottom action buttons for one-tap operations."""
    buttons = [
        ["🚀 توليد الفيديو (Generate)", "🎨 تغيير القالب (Templates)"],
        ["📋 الأخبار المضافة (Rounds)", "↩️ تراجع عن آخر خبر (Undo)"],
        ["🗑️ تفريغ القائمة (Clear)", "ℹ️ دليل الاستخدام وشرح البوت (Guide)"],
    ]
    return ReplyKeyboardMarkup(buttons, resize_keyboard=True)


def get_round_action_inline_keyboard(count: int):
    """Interactive inline buttons attached under each added round message."""
    buttons = [
        [
            InlineKeyboardButton(
                f"🚀 توليد الفيديو الآن ({count} أخبار)",
                callback_data="action_generate",
            )
        ],
        [
            InlineKeyboardButton("↩️ تراجع عن آخر خبر", callback_data="action_undo"),
            InlineKeyboardButton("📋 عرض القائمة", callback_data="action_rounds"),
        ],
        [
            InlineKeyboardButton("🎨 تغيير القالب", callback_data="action_templates"),
            InlineKeyboardButton("🗑️ تفريغ القائمة", callback_data="action_clear"),
        ],
        [
            InlineKeyboardButton("ℹ️ دليل الاستخدام", callback_data="action_guide"),
        ],
    ]
    return InlineKeyboardMarkup(buttons)


def get_template_keyboard(current_tmpl: str = "breaking_news"):
    records = get_all_templates()
    buttons = []
    row = []

    for idx, rec in enumerate(records):
        t_id = rec.meta.id
        t_name = rec.meta.name
        is_selected = "✅ " if current_tmpl == t_id else ""
        btn = InlineKeyboardButton(
            f"{is_selected}{t_name}",
            callback_data=f"template_{t_id}",
        )
        row.append(btn)
        if len(row) == 2 or idx == len(records) - 1:
            buttons.append(row)
            row = []

    if not buttons:
        buttons = [[
            InlineKeyboardButton(
                "🚨 خبر عاجل",
                callback_data="template_breaking_news",
            )
        ]]

    return InlineKeyboardMarkup(buttons)


async def guide_cmd(update: Update, context):
    """Send a complete recap explaining Kashida Video, what it does, and how it works."""
    guide_text = (
        "📖 *دليل منصة كشيدة (Kashida Video)*\n"
        "━━━━━━━━━━━━━━━━━━━━\n\n"
        "🌟 *ما هو كشيدة (Kashida)؟*\n"
        "كشيدة هي منصة متخصصة لغرف الأخبار وصناع المحتوى لإنتاج *فيديوهات وتصاميم إخبارية عربية احترافية تلقائياً* "
        "بدقة عالية (1080×1920) ونسب 9:16 المخصصة لمنصات (Reels, TikTok, X, Shorts).\n\n"
        "⚡ *كيف يعمل البوت؟ (3 خطوات فقط)*\n\n"
        "1️⃣ *اختر القالب المطلوب:* اضغط زر `🎨 تغيير القالب` لاختيار نمط التصميم (خبر عاجل، اقتباس وتصريح، تقارير مالية، تغطية رياضية).\n\n"
        "2️⃣ *أرسل الخبر والوسائط:* أرسل صورة أو مقطع فيديو مع نص الخبر (السطر الأول = العنوان الرئيسي، السطور التالية = العنوان الفرعي).\n"
        "💡 *ميزة الأخبار المتعددة:* يمكنك إرسال أكثر من خبر تباعاً لدمجها جميعاً في فيديو إخباري واحد متسلسل!\n\n"
        "3️⃣ *اضغط زر التوليد:* اضغط على `🚀 توليد الفيديو` وسيقوم المحرك (Playwright + GSAP + FFmpeg) برندرة الفيديو وتصديره إليك خلال ثوانٍ!\n\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        "👇 *استخدم الأزرار أدناه للتحكم السريع بدون الحاجة لكتابة أوامر:*"
    )
    if update.callback_query:
        await update.callback_query.message.reply_text(
            guide_text,
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            guide_text,
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown",
        )


async def start_cmd(update: Update, context):
    chat_id = update.effective_chat.id
    current_tmpl = USER_TEMPLATES.get(chat_id, DEFAULT_TEMPLATE_ID)
    tmpl_name = _tmpl_config(current_tmpl)["name"]

    welcome_text = (
        "🎬 *مرحباً بك في منصة كشيدة (Kashida Video)*\n"
        "أتمتة وتصميم فيديوهات الأخبار العربية التفاعلية باحترافية عالية.\n\n"
        f"🎨 *القالب النشط حالياً:* `{tmpl_name}`\n\n"
        "✨ *خطوات العمل السريعة:*\n"
        "1️⃣ *اختر القالب* من الأزرار أدناه.\n"
        "2️⃣ *أرسل الخبر* مرفقاً بصورة أو مقطع فيديو (يمكنك إرسال عدة أخبار متتالية).\n"
        "3️⃣ اضغط زر *🚀 توليد الفيديو* وسنرسل لك مقطع MP4 جاهزاً للنشر!\n\n"
        "👇 *اختر القالب المفضل للبدء:*"
    )
    await update.message.reply_text(
        welcome_text,
        reply_markup=get_template_keyboard(current_tmpl),
        parse_mode="Markdown",
    )
    # Also attach persistent bottom buttons
    await update.message.reply_text(
        "💡 *لوحة التحكم السريعة جاهزة دائماً أسفل الشاشة:*",
        reply_markup=get_main_keyboard(),
        parse_mode="Markdown",
    )


async def templates_cmd(update: Update, context):
    chat_id = update.effective_chat.id
    current_tmpl = USER_TEMPLATES.get(chat_id, DEFAULT_TEMPLATE_ID)
    text = "🎨 *اختر قالب الفيديو الإخباري المطلوب:*"
    if update.callback_query:
        await update.callback_query.message.reply_text(
            text,
            reply_markup=get_template_keyboard(current_tmpl),
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            text,
            reply_markup=get_template_keyboard(current_tmpl),
            parse_mode="Markdown",
        )


async def action_callback(update: Update, context):
    query = update.callback_query
    await query.answer()

    data = query.data
    if data == "action_generate":
        await generate_cmd(update, context)
    elif data == "action_undo":
        await undo_cmd(update, context)
    elif data == "action_rounds":
        await rounds_cmd(update, context)
    elif data == "action_templates":
        await templates_cmd(update, context)
    elif data == "action_clear":
        await clear_cmd(update, context)
    elif data == "action_guide":
        await guide_cmd(update, context)
    elif data.startswith("template_"):
        await template_callback(update, context)


async def template_callback(update: Update, context):
    query = update.callback_query
    await query.answer()

    data = query.data
    if not data.startswith("template_"):
        return

    tmpl_id = data.replace("template_", "")
    if _template_exists(tmpl_id):
        chat_id = query.message.chat_id
        USER_TEMPLATES[chat_id] = tmpl_id
        tmpl_name = _tmpl_config(tmpl_id)["name"]

        reply_text = (
            f"✅ *تم اختيار القالب:* `{tmpl_name}`\n\n"
            "الآن أرسل مقطع فيديو (MP4) أو صورة مع نص الخبر لتوليد الفيديو تلقائياً!"
        )
        await query.edit_message_text(
            reply_text,
            reply_markup=get_template_keyboard(tmpl_id),
            parse_mode="Markdown",
        )


async def handle_media_or_text(update: Update, context):
    """Append a news round (text + media) or handle persistent button clicks."""
    message = update.message
    if not message:
        return

    chat_id = message.chat_id
    raw_text = (message.text or message.caption or "").strip()

    # --- Persistent Button Clicks ---------------------------------------------
    if raw_text == "🚀 توليد الفيديو (Generate)":
        await generate_cmd(update, context)
        return
    elif raw_text == "🎨 تغيير القالب (Templates)":
        await templates_cmd(update, context)
        return
    elif raw_text == "📋 الأخبار المضافة (Rounds)":
        await rounds_cmd(update, context)
        return
    elif raw_text in ("↩️ تراجع عن آخر خبر (Undo)", "↩️ تراجع عن آخر خبر", "↩️ تراجع (Undo)"):
        await undo_cmd(update, context)
        return
    elif raw_text == "🗑️ تفريغ القائمة (Clear)":
        await clear_cmd(update, context)
        return
    elif raw_text in ("ℹ️ دليل الاستخدام وشرح البوت (Guide)", "ℹ️ دليل الاستخدام (Guide)", "ℹ️ شرح البوت"):
        await guide_cmd(update, context)
        return

    video_url = ""
    image_url = ""

    # No media -> reject (text-only is not allowed).
    if not (message.video or message.animation or message.photo):
        await message.reply_text(
            "⚠️ *نسمح فقط بالخبر المرفق مع صورة أو مقطع فيديو.*\n"
            "أرسل نص الخبر مع صورة أو مقطع فيديو في نفس الرسالة.",
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown",
        )
        return

    media_task_id = uuid4().hex

    # Download video clip if provided.
    if message.video or message.animation:
        status_prep = await message.reply_text("📹 جاري تحميل مقطع الفيديو الخاص بك... ⏳")
        media_obj = message.video or message.animation
        vid_filename = f"tg_{media_task_id}.mp4"
        vid_path = ASSET_VID_DIR / vid_filename

        try:
            telegram_file = await context.bot.get_file(media_obj.file_id)
            await telegram_file.download_to_drive(vid_path)
            video_url = f"file://{vid_path.resolve()}"
            await bot_delete_message(context.bot, chat_id, status_prep.message_id)
        except Exception as e:
            err_str = str(e)
            if "File is too big" in err_str or "file is too big" in err_str.lower():
                await status_prep.edit_text(
                    "⚠️ *حجم مقطع الفيديو كبير جداً* (أكبر من الحد الأقصى 20MB المسموح به عبر تيليجرام).\n"
                    "يرجى إرسال مقطع فيديو مضغوط أو بجودة قياسية.",
                    parse_mode="Markdown",
                )
            else:
                await status_prep.edit_text(f"❌ فشل في تحميل مقطع الفيديو: {e}")
            return
    elif message.photo:
        status_prep = await message.reply_text("📥 جاري تحويل الصورة لخلفية... ⏳")
        photo = message.photo[-1]
        photo_filename = f"tg_{media_task_id}.jpg"
        photo_path = ASSET_VID_DIR / photo_filename

        try:
            telegram_file = await context.bot.get_file(photo.file_id)
            await telegram_file.download_to_drive(photo_path)
            image_url = f"file://{photo_path.resolve()}"
            await bot_delete_message(context.bot, chat_id, status_prep.message_id)
        except Exception as e:
            await status_prep.edit_text(f"❌ فشل في تحميل الصورة: {e}")
            return

    # Parse headline & subheadline.
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
    headline = lines[0] if lines else "خبر عاجل"
    subheadline = " | ".join(lines[1:]) if len(lines) > 1 else "كشيدة · kashida.io"

    current_tmpl = USER_TEMPLATES.get(chat_id, DEFAULT_TEMPLATE_ID)
    tmpl_conf = _tmpl_config(current_tmpl)

    round_data = {
        "headline": headline,
        "subheadline": subheadline,
        "videoUrl": video_url,
        "imageUrl": image_url,
        "accentColor": tmpl_conf["accentColor"],
        "backgroundColor": tmpl_conf["backgroundColor"],
        "labelAr": tmpl_conf["labelAr"],
        "labelEn": tmpl_conf["labelEn"],
        "videoScale": 1.0,
        "videoPositionX": 50,
        "videoPositionY": 50,
        "videoFit": "cover",
        "overlayOpacity": 0.65,
    }

    rounds = PENDING_ROUNDS.setdefault(chat_id, [])
    rounds.append(round_data)

    safe_headline = _safe_md(headline)
    await message.reply_text(
        f"✅ *تمت إضافة الخبر رقم ({len(rounds)}) إلى الفيديو:*\n"
        f"📌 *العنوان:* `{safe_headline}`\n\n"
        f"🎨 *القالب النشط:* `{tmpl_conf['name']}`\n\n"
        "يمكنك إرسال المزيد من الأخبار لدمجها، أو الضغط على الزر أدناه للتوليد فوراً:",
        reply_markup=get_round_action_inline_keyboard(len(rounds)),
        parse_mode="Markdown",
    )


async def undo_cmd(update: Update, context):
    """Remove / pop the last added news round from the queue."""
    chat_id = update.effective_chat.id
    rounds = PENDING_ROUNDS.get(chat_id, [])

    if not rounds:
        text = "⚠️ *لا توجد أخبار في قائمة الانتظار للتراجع عنها.*"
        if update.callback_query:
            await update.callback_query.message.reply_text(
                text,
                reply_markup=get_main_keyboard(),
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text(
                text,
                reply_markup=get_main_keyboard(),
                parse_mode="Markdown",
            )
        return

    removed = rounds.pop()
    # Clean up temporary uploaded media file for the undone round
    _cleanup_round_media([removed])

    current_tmpl = USER_TEMPLATES.get(chat_id, DEFAULT_TEMPLATE_ID)
    tmpl_name = _tmpl_config(current_tmpl)["name"]

    removed_hl = _safe_md(removed.get('headline', ''), 50)

    if rounds:
        lines = [f"{i + 1}️⃣ `{_safe_md(r.get('headline', ''), 60)}`" for i, r in enumerate(rounds)]
        text = (
            f"↩️ *تم التراجع وحذف آخر خبر مضاف:*\n"
            f"🗑️ `{removed_hl}`\n\n"
            f"📋 *الأخبار المتبقية في قائمة الانتظار ({len(rounds)}):*\n"
            f"🎨 *القالب المختار:* `{tmpl_name}`\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            + "\n".join(lines)
            + "\n\n👇 يمكنك إضافة خبر جديد أو التوليد الآن:"
        )
        markup = get_round_action_inline_keyboard(len(rounds))
    else:
        text = (
            f"↩️ *تم التراجع وحذف الخبر:*\n"
            f"🗑️ `{removed_hl}`\n\n"
            "📭 *أصبحت قائمة الأخبار فارغة الآن.*\n"
            "أرسل خبراً جديداً مع صورة أو مقطع فيديو للبدء."
        )
        markup = get_main_keyboard()

    if update.callback_query:
        await update.callback_query.message.reply_text(
            text,
            reply_markup=markup,
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            text,
            reply_markup=markup,
            parse_mode="Markdown",
        )


async def rounds_cmd(update: Update, context):
    chat_id = update.effective_chat.id
    rounds = PENDING_ROUNDS.get(chat_id, [])
    current_tmpl = USER_TEMPLATES.get(chat_id, DEFAULT_TEMPLATE_ID)
    tmpl_name = _tmpl_config(current_tmpl)["name"]

    if not rounds:
        text = (
            "📭 *لا توجد أخبار مضافة بعد.*\n\n"
            "أرسل خبراً مع صورة أو مقطع فيديو للبدء، أو اختر القالب أولاً."
        )
        if update.callback_query:
            await update.callback_query.message.reply_text(
                text,
                reply_markup=get_main_keyboard(),
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text(
                text,
                reply_markup=get_main_keyboard(),
                parse_mode="Markdown",
            )
        return

    lines = [f"{i + 1}️⃣ `{_safe_md(r.get('headline', ''), 60)}`" for i, r in enumerate(rounds)]
    text = (
        f"🗂️ *الأخبار المضافة في قائمة الانتظار ({len(rounds)}):*\n"
        f"🎨 *القالب المختار:* `{tmpl_name}`\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        + "\n".join(lines)
        + "\n\n👇 اضغط على زر التوليد لتصدير الفيديو:"
    )

    if update.callback_query:
        await update.callback_query.message.reply_text(
            text,
            reply_markup=get_round_action_inline_keyboard(len(rounds)),
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            text,
            reply_markup=get_round_action_inline_keyboard(len(rounds)),
            parse_mode="Markdown",
        )


async def clear_cmd(update: Update, context):
    chat_id = update.effective_chat.id
    rounds = PENDING_ROUNDS.pop(chat_id, None) or []
    _cleanup_round_media(rounds)
    text = "🗑️ *تم تفريغ قائمة الأخبار المضافة بنجاح.*"
    if update.callback_query:
        await update.callback_query.message.reply_text(
            text,
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            text,
            reply_markup=get_main_keyboard(),
            parse_mode="Markdown",
        )


async def generate_cmd(update: Update, context):
    chat_id = update.effective_chat.id
    rounds = PENDING_ROUNDS.get(chat_id, [])
    if not rounds:
        current_tmpl = USER_TEMPLATES.get(chat_id, DEFAULT_TEMPLATE_ID)
        tmpl_name = _tmpl_config(current_tmpl)["name"]
        text = (
            "⚠️ *لا توجد أخبار مضافة في قائمة الانتظار.*\n\n"
            f"🎨 *القالب المختار حالياً:* `{tmpl_name}`\n\n"
            "💡 *كيفية إنشاء وتوليد الفيديو:* \n"
            "1️⃣ أرسل صورة أو مقطع فيديو مع نص الخبر (السطر الأول = العنوان الرئيسي، السطور التالية = العنوان الفرعي).\n"
            "2️⃣ يمكنك إرسال أكثر من خبر متتالي لدمجها معاً في فيديو متسلسل واحد.\n"
            "3️⃣ ثم اضغط زر *🚀 توليد الفيديو* وسيقوم النظام برندرة الفيديو وتصديره إليك فوراً!"
        )
        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("🎨 تغيير القالب", callback_data="action_templates"),
                InlineKeyboardButton("ℹ️ دليل الاستخدام", callback_data="action_guide"),
            ]
        ])
        if update.callback_query:
            await update.callback_query.message.reply_text(
                text,
                reply_markup=keyboard,
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text(
                text,
                reply_markup=keyboard,
                parse_mode="Markdown",
            )
        return

    task_id = uuid4().hex
    current_tmpl = USER_TEMPLATES.get(chat_id, DEFAULT_TEMPLATE_ID)
    tmpl_config = _tmpl_config(current_tmpl)

    video_data = {
        "template": current_tmpl,
        "fps": 30,
        "resolution": {"width": 1080, "height": 1920},
        "labelAr": tmpl_config["labelAr"],
        "labelEn": tmpl_config["labelEn"],
        "accentColor": tmpl_config["accentColor"],
        "backgroundColor": tmpl_config["backgroundColor"],
        "rounds": list(rounds),
    }

    # Carry the template's bumper config through (enabled intro/interstitial/outro
    # segments render around the rounds). Absent/disabled → no bumpers.
    if tmpl_config.get("bumper"):
        video_data["bumper"] = tmpl_config["bumper"]

    # Keep the submitted rounds for reference in the in-memory store.
    USER_SESSIONS[task_id] = video_data
    # Consume the queue now; the payload is captured in USER_SESSIONS.
    PENDING_ROUNDS[chat_id] = []

    await process_render_job(context.bot, chat_id, task_id, video_data)


async def process_render_job(bot, chat_id: int, task_id: str, video_data: dict):
    try:
        from workers.tasks import render_video_task

        async_res = render_video_task.delay(task_id, video_data)
    except Exception as e:
        ar_err = format_arabic_error(e)
        await bot.send_message(chat_id, f"❌ حدث خطأ أثناء تقديم طلب الرندرة:\n{ar_err}")
        return

    tmpl_name = _tmpl_config(video_data["template"])["name"]
    rounds_count = len(video_data.get("rounds", []))
    status_msg = await bot.send_message(
        chat_id,
        f"🎬 *جاري توليد الفيديو بالقالب: `{tmpl_name}`...* ⏳\n"
        f"📋 عدد الأخبار: `{rounds_count}`\n"
        "• تركيب قالب الخبر على مقطع الفيديو (Playwright & FFmpeg)\n"
        "• يرجى الانتظار بضع ثوانٍ...",
        parse_mode="Markdown",
    )
    status_msg_id = status_msg.message_id

    # Poll celery status
    for _ in range(60):
        await asyncio.sleep(2)
        state = async_res.state
        info = async_res.info or {}

        if state in ("STARTED", "RENDERING", "ENCODING", "PROGRESS"):
            stage = info.get("status") or info.get("stage") or state
            pct = info.get("percent", 0)
            msg = info.get("message", "")
            try:
                await bot.edit_message_text(
                    f"🎬 *جاري العمل:* `{stage}` ({pct}%)\n_{msg}_",
                    chat_id=chat_id,
                    message_id=status_msg_id,
                    parse_mode="Markdown",
                )
            except Exception:
                pass
            continue

        if state == "SUCCESS":
            out_file = STATIC_DIR / f"{task_id}.mp4"
            if out_file.exists():
                await bot.edit_message_text(
                    "📤 *اكتملت الرندرة! جاري إرسال الفيديو...* ⏳",
                    chat_id=chat_id,
                    message_id=status_msg_id,
                    parse_mode="Markdown",
                )
                try:
                    duration_sec = get_video_duration_seconds(out_file)
                    dur_text = f"{duration_sec:.1f} ثانية" if duration_sec > 0 else "تلقائية حسب الوسائط"
                    rounds_label = f"{rounds_count} خبر" if rounds_count == 1 else f"{rounds_count} أخبار"

                    caption = (
                        f"✨ *تم إنشاء الفيديو بنجاح بواسطة منصة كشيدة (Kashida.io)*\n"
                        f"🎨 *القالب:* `{tmpl_name}`\n"
                        f"📋 *عدد المشاهد:* `{rounds_label}`\n"
                        f"⏱️ *المدة:* `{dur_text}`\n"
                        f"📐 *الأبعاد والجودة:* `1080×1920 (9:16) · 30fps`"
                    )

                    with open(out_file, "rb") as vf:
                        await bot.send_video(
                            chat_id=chat_id,
                            video=vf,
                            caption=caption,
                            reply_markup=get_main_keyboard(),
                            parse_mode="Markdown",
                        )
                finally:
                    # Clean up the output MP4 file after sending
                    try:
                        if out_file.exists():
                            out_file.unlink(missing_ok=True)
                    except Exception:
                        pass

                    # Clean up temporary uploaded round media
                    _cleanup_round_media(video_data.get("rounds", []))

                await bot_delete_message(bot, chat_id, status_msg_id)
            else:
                _cleanup_round_media(video_data.get("rounds", []))
                await bot.edit_message_text(
                    "⚠️ تم إكمال مهمة الرندرة بنجاح ولكن تعذر العثور على ملف الفيديو الناتج على الخادم.",
                    chat_id=chat_id,
                    message_id=status_msg_id,
                )
            return

        if state == "FAILURE":
            _cleanup_round_media(video_data.get("rounds", []))
            err_info = info.get("error") or info.get("message") or "فشل في مرحلة الرندرة"
            ar_error = format_arabic_error(err_info)
            await bot.edit_message_text(
                f"❌ *تعذر إكمال توليد الفيديو*\n\n{ar_error}",
                chat_id=chat_id,
                message_id=status_msg_id,
                parse_mode="Markdown",
            )
            return

    _cleanup_round_media(video_data.get("rounds", []))
    await bot.edit_message_text(
        "⏳ *انتهت المهلة المحددة لتوليد الفيديو (دقيقتان).*\nيرجى التأكد من تشغيل عمال الرندرة والاتصال.",
        chat_id=chat_id,
        message_id=status_msg_id,
        parse_mode="Markdown",
    )


async def bot_delete_message(bot, chat_id: int, msg_id: int):
    try:
        await bot.delete_message(chat_id=chat_id, message_id=msg_id)
    except Exception:
        pass


def main():
    if not TELEGRAM_BOT_TOKEN:
        print("ERROR: TELEGRAM_BOT_TOKEN not set in .env")
        return

    print("Starting Kashida Video Bot (polling mode with buttons and dynamic templates)...")
    print(f"Token: ...{TELEGRAM_BOT_TOKEN[-8:]}")

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start_cmd))
    app.add_handler(CommandHandler("templates", templates_cmd))
    app.add_handler(CommandHandler("template", templates_cmd))
    app.add_handler(CommandHandler("generate", generate_cmd))
    app.add_handler(CommandHandler("rounds", rounds_cmd))
    app.add_handler(CommandHandler("undo", undo_cmd))
    app.add_handler(CommandHandler("clear", clear_cmd))
    app.add_handler(CommandHandler("help", guide_cmd))
    app.add_handler(CommandHandler("guide", guide_cmd))
    app.add_handler(CallbackQueryHandler(action_callback, pattern="^action_"))
    app.add_handler(CallbackQueryHandler(template_callback, pattern="^template_"))
    app.add_handler(
        MessageHandler(
            filters.VIDEO | filters.ANIMATION | filters.PHOTO | (filters.TEXT & ~filters.COMMAND),
            handle_media_or_text,
        )
    )

    print("Bot is running. Send text or videos in Telegram!")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
