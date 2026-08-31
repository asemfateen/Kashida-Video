import pytest
from unittest.mock import AsyncMock, MagicMock
from api.bot import (
    PENDING_ROUNDS,
    USER_TEMPLATES,
    DEFAULT_TEMPLATE_ID,
    undo_cmd,
    generate_cmd,
    format_arabic_error,
    get_main_keyboard,
    get_round_action_inline_keyboard,
    get_video_duration_seconds,
)


@pytest.fixture(autouse=True)
def clean_bot_state():
    PENDING_ROUNDS.clear()
    USER_TEMPLATES.clear()
    yield
    PENDING_ROUNDS.clear()
    USER_TEMPLATES.clear()


def test_format_arabic_error_categorization():
    # Playwright / Chromium error
    err_pw = format_arabic_error("Playwright browser closed unexpectedly")
    assert "Playwright/Chromium" in err_pw

    # FFmpeg error
    err_ff = format_arabic_error("FFmpeg demuxer stream corrupt or missing codec")
    assert "FFmpeg" in err_ff

    # Redis / Celery connection error
    err_conn = format_arabic_error("Error connecting to redis broker at localhost:6379")
    assert "Redis/Celery" in err_conn

    # Timeout error
    err_to = format_arabic_error("Task timed out after 120s")
    assert "المهلة المحددة" in err_to

    # Generic fallback
    err_gen = format_arabic_error("Custom unhandled exception")
    assert "Custom unhandled exception" in err_gen


def test_get_main_keyboard_and_inline_keyboard():
    main_kb = get_main_keyboard()
    # Ensure undo button is present in main persistent buttons
    all_buttons = [btn.text if hasattr(btn, 'text') else str(btn) for row in main_kb.keyboard for btn in row]
    assert any("تراجع" in b for b in all_buttons)

    inline_kb = get_round_action_inline_keyboard(3)
    inline_callbacks = [btn.callback_data for row in inline_kb.inline_keyboard for btn in row]
    assert "action_undo" in inline_callbacks
    assert "action_generate" in inline_callbacks


@pytest.mark.anyio
async def test_undo_cmd_flow():
    chat_id = 12345
    update = MagicMock()
    update.effective_chat.id = chat_id
    update.callback_query = None
    update.message = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()

    # 1. When queue is empty -> shows warning
    await undo_cmd(update, context)
    update.message.reply_text.assert_called_once()
    assert "لا توجد أخبار" in update.message.reply_text.call_args[0][0]

    # 2. Add 2 rounds and undo last one
    PENDING_ROUNDS[chat_id] = [
        {"headline": "Headline 1", "subheadline": "Sub 1"},
        {"headline": "Headline 2", "subheadline": "Sub 2"},
    ]
    update.message.reply_text.reset_mock()
    await undo_cmd(update, context)

    assert len(PENDING_ROUNDS[chat_id]) == 1
    assert PENDING_ROUNDS[chat_id][0]["headline"] == "Headline 1"
    msg_text = update.message.reply_text.call_args[0][0]
    assert "تم التراجع وحذف آخر خبر" in msg_text
    assert "Headline 2" in msg_text
    assert "Headline 1" in msg_text

    # 3. Undo remaining round -> queue becomes empty
    update.message.reply_text.reset_mock()
    await undo_cmd(update, context)
    assert len(PENDING_ROUNDS[chat_id]) == 0
    msg_text_empty = update.message.reply_text.call_args[0][0]
    assert "أصبحت قائمة الأخبار فارغة الآن" in msg_text_empty


@pytest.mark.anyio
async def test_generate_cmd_empty_queue_guidance():
    chat_id = 99999
    update = MagicMock()
    update.effective_chat.id = chat_id
    update.callback_query = None
    update.message = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()

    # When queue is empty, /generate provides guidance and template info
    await generate_cmd(update, context)
    update.message.reply_text.assert_called_once()
    msg = update.message.reply_text.call_args[0][0]
    assert "لا توجد أخبار مضافة" in msg
    assert "كيفية إنشاء وتوليد الفيديو" in msg


@pytest.mark.anyio
async def test_undo_and_generate_via_callback_query():
    from api.bot import action_callback
    chat_id = 77777

    # Test action_undo callback when empty
    query = MagicMock()
    query.data = "action_undo"
    query.answer = AsyncMock()
    query.message = MagicMock()
    query.message.chat_id = chat_id
    query.message.reply_text = AsyncMock()
    update = MagicMock()
    update.effective_chat.id = chat_id
    update.callback_query = query
    context = MagicMock()

    await action_callback(update, context)
    query.answer.assert_called_once()
    query.message.reply_text.assert_called_once()
    assert "لا توجد أخبار" in query.message.reply_text.call_args[0][0]

    # Test action_generate callback when empty
    query.reset_mock()
    query.data = "action_generate"
    query.answer = AsyncMock()
    query.message = MagicMock()
    query.message.chat_id = chat_id
    query.message.reply_text = AsyncMock()

    await action_callback(update, context)
    query.answer.assert_called_once()
    query.message.reply_text.assert_called_once()
    assert "لا توجد أخبار مضافة" in query.message.reply_text.call_args[0][0]


def test_format_arabic_error_sanitizes_markdown_chars():
    # Error with unescaped markdown chars
    err = format_arabic_error("DB_*_syntax_error `SELECT * FROM tbl`")
    assert "*" not in err
    assert "`" not in err
    assert "SELECT" in err


def test_get_video_duration_seconds_nonexistent_file(tmp_path):
    fake_file = tmp_path / "nonexistent.mp4"
    dur = get_video_duration_seconds(fake_file)
    assert dur == 0.0


@pytest.mark.anyio
async def test_undo_and_clear_media_cleanup(tmp_path):
    from api.bot import clear_cmd, _cleanup_round_media
    chat_id = 55555

    # Create dummy temp media files
    temp_vid = tmp_path / "tg_test_1.mp4"
    temp_img = tmp_path / "tg_test_2.jpg"
    non_tg_asset = tmp_path / "static_asset.mp4"
    temp_vid.write_text("dummy video")
    temp_img.write_text("dummy image")
    non_tg_asset.write_text("static video")
    assert temp_vid.exists()
    assert temp_img.exists()
    assert non_tg_asset.exists()

    PENDING_ROUNDS[chat_id] = [
        {"headline": "H1", "videoUrl": f"file://{temp_vid}"},
        {"headline": "H2", "imageUrl": f"file://{temp_img}"},
        {"headline": "H3", "videoUrl": f"file://{non_tg_asset}"},
    ]

    update = MagicMock()
    update.effective_chat.id = chat_id
    update.callback_query = None
    update.message = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()

    # 1. Undo round 3 (non-tg asset) -> does NOT delete static asset
    await undo_cmd(update, context)
    assert non_tg_asset.exists()
    assert len(PENDING_ROUNDS[chat_id]) == 2

    # 2. Undo round 2 (temp_img) -> cleans up temp_img
    await undo_cmd(update, context)
    assert not temp_img.exists()
    assert temp_vid.exists()
    assert len(PENDING_ROUNDS[chat_id]) == 1

    # 3. Clear remaining queue -> cleans up temp_vid
    await clear_cmd(update, context)
    assert not temp_vid.exists()
    assert len(PENDING_ROUNDS.get(chat_id, [])) == 0

    # 4. _cleanup_round_media handles empty, malformed, or missing URLs safely
    _cleanup_round_media([
        {"videoUrl": ""},
        {"imageUrl": "http://example.com/test.jpg"},
        {"videoUrl": "file:///nonexistent/path/tg_fake.mp4"},
    ])



