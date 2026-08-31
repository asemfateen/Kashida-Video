import os
from pathlib import Path
from uuid import uuid4

from telegram import Bot, Update

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "videos"
ASSET_IMG_DIR = Path(__file__).resolve().parent.parent / "data" / "assets" / "image"
ASSET_IMG_DIR.mkdir(parents=True, exist_ok=True)


async def handle_update(update: Update):
    if not update or not update.message:
        return

    message = update.message
    chat_id = message.chat_id
    raw_text = message.text or message.caption or ""

    if raw_text == "/start":
        bot = Bot(token=TELEGRAM_BOT_TOKEN)
        await bot.send_message(
            chat_id=chat_id,
            text=(
                "🎬 *مرحباً بك في منصة كشيدة (Kashida.io)*\n"
                "أتمتة وتصميم صور وفيديوهات الأخبار العربية الاحترافية.\n\n"
                "✨ *كيفية الاستخدام:*\n"
                "1️⃣ *أرسل صورة خبر* مع نص الخبر في التعليق.\n"
                "2️⃣ أو *أرسل نص الخبر* مباشرة.\n"
                "3️⃣ وسنقوم فوراً بتوليد فيديو عاجل بدقة 1080×1920!"
            ),
            parse_mode="Markdown",
        )
        return

    task_id = uuid4().hex
    image_url = ""
    bot = Bot(token=TELEGRAM_BOT_TOKEN)

    if message.photo:
        photo = message.photo[-1]
        photo_filename = f"tg_{task_id}.jpg"
        photo_path = ASSET_IMG_DIR / photo_filename
        try:
            telegram_file = await bot.get_file(photo.file_id)
            await telegram_file.download_to_drive(photo_path)
            image_url = f"file://{photo_path.resolve()}"
        except Exception as e:
            await bot.send_message(chat_id, f"❌ فشل تحميل الصورة: {e}")
            return

    if not raw_text.strip():
        if message.photo:
            raw_text = "خبر عاجل من كشيدة"
        else:
            await bot.send_message(chat_id, "⚠️ الرجاء إرسال نص الخبر أو صورة مع نص في التعليق.")
            return

    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
    headline = lines[0] if lines else "خبر عاجل"
    subheadline = " | ".join(lines[1:]) if len(lines) > 1 else "كشيدة · kashida.io"

    video_data = {
        "headline": headline,
        "subheadline": subheadline,
        "accentColor": "#e63946",
        "backgroundColor": "#0b0b0f",
        "duration": 5,
        "fps": 30,
        "imageUrl": image_url,
        "imageScale": 1.0,
        "imagePositionX": 50,
        "imagePositionY": 50,
        "imageFit": "cover",
        "overlayOpacity": 0.65,
    }

    try:
        from workers.tasks import render_video_task

        async_res = render_video_task.delay(task_id, video_data)
        celery_task_id = async_res.id
    except Exception as e:
        await bot.send_message(chat_id, f"❌ حدث خطأ أثناء تقديم طلب المعالجة: {e}")
        return

    status_msg = await bot.send_message(
        chat_id,
        "🎬 *جاري توليد الفيديو الإخباري...* ⏳\n"
        "كشيدة تعمل على تصيير الفيديو بـ Playwright...",
        parse_mode="Markdown",
    )

    await _poll_and_send(task_id, celery_task_id, chat_id, status_msg.message_id)


async def _poll_and_send(task_id: str, celery_task_id: str, chat_id: int, status_msg_id: int):
    import asyncio

    from celery.result import AsyncResult
    from workers.celery_app import app as celery_app

    bot = Bot(token=TELEGRAM_BOT_TOKEN)

    for i in range(300):
        await asyncio.sleep(1)
        result = AsyncResult(celery_task_id, app=celery_app)

        if not result.ready():
            continue

        if result.successful():
            video_path = STATIC_DIR / f"{task_id}.mp4"
            if video_path.exists():
                with open(video_path, "rb") as f:
                    await bot.send_video(
                        chat_id=chat_id,
                        video=f,
                        caption="✅ **تم إنشاء الفيديو بنجاح عبر كشيدة!**\n🌐 kashida.io",
                        parse_mode="Markdown",
                    )
                try:
                    await bot.delete_message(chat_id=chat_id, message_id=status_msg_id)
                except Exception:
                    pass
            else:
                await bot.edit_message_text(
                    "⚠️ تم الانتهاء من المعالجة لكن يتعذر العثور على ملف الفيديو الناتج.",
                    chat_id=chat_id,
                    message_id=status_msg_id,
                )
            return

        await bot.edit_message_text(
            "❌ فشلت عملية توليد الفيديو.",
            chat_id=chat_id,
            message_id=status_msg_id,
        )
        return

    await bot.edit_message_text(
        "⏳ انتهت مهلة توليد الفيديو.",
        chat_id=chat_id,
        message_id=status_msg_id,
    )


handle_message = handle_update
