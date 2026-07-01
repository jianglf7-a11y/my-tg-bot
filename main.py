import os
import telebot
from google import genai
from google.genai import types

# 1. 初始化配置 (从系统环境变量中读取，更安全)
TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")

bot = telebot.TeleBot(TG_TOKEN)
ai_client = genai.Client(api_key=GEMINI_KEY)

# 2. 注入你的顶尖投手人格
SYSTEM_INSTRUCTION = (
    "你是一个深谙巴西 Slots 行业的顶尖信息流广告投手，精通 Meta 竞价底层逻辑。你的任务是协助用户进行高效盯盘和素材迭代。"
    "你说话风格干练、一针见血，绝不废话，能从用户发送的后台截图或文字中快速诊断出‘吸血版位’、‘归因延迟’等问题。"
    "你深知‘一刀流’、‘CBO 裂变’等高级预算策略，能够根据像素购买事件的数量（如2000+购物的老像素）给出极具攻击性的ROI调优建议。"
)

def ask_gemini(prompt_text, image_data=None):
    """向 Gemini 提问，支持文字和图片"""
    contents = [prompt_text] if prompt_text else []
    
    if image_data:
        # 如果有图片，转为 Gemini 识别的格式
        image_part = types.Part.from_bytes(
            data=image_data,
            mime_type="image/jpeg"
        )
        contents.append(image_part)
        
    try:
        response = ai_client.models.generate_content(
            model='gemini-1.5-pro',  # 使用支持看图和高级分析的 1.5 Pro
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.4 # 降低随机性，让回答更专业严谨
            )
        )
        return response.text
    except Exception as e:
        return f"❌ Gemini 接口报错啦: {str(e)}"

# 3. 处理 Telegram 接收到的消息
@bot.message_handler(content_types=['text', 'photo'])
def handle_messages(message):
    chat_id = message.chat.id
    
    # 如果用户发的是文字
    if message.content_type == 'text':
        bot.send_chat_action(chat_id, 'typing')
        reply = ask_gemini(message.text)
        bot.reply_to(message, reply)
        
    # 如果用户发的是图片（比如 Meta 后台截图）
    elif message.content_type == 'photo':
        bot.send_chat_action(chat_id, 'typing')
        # 获取文字说明（如果有的话）
        caption = message.caption if message.caption else "分析一下这张 Meta 投放后台的数据截图，找出问题和优化方向。"
        
        # 下载图片文件
        file_info = bot.get_file(message.photo[-1].file_id)
        downloaded_file = bot.download_file(file_info.file_path)
        
        # 喂给 Gemini
        reply = ask_gemini(caption, image_data=downloaded_file)
        bot.reply_to(message, reply)

if __name__ == "__main__":
    print("🚀 巴西 Slots 投手 Bot 已启动，正在监听消息...")
    bot.infinity_polling()