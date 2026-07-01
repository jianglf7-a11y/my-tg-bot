export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK");
    }

    try {
      const update = await request.json();
      if (!update.message) return new Response("OK");

      const chatId = update.message.chat.id;
      let text = update.message.text || "";
      let fileId = null;

      // 检查是否有图片（后台数据截图）
      if (update.message.photo && update.message.photo.length > 0) {
        fileId = update.message.photo[update.message.photo.length - 1].file_id;
        text = update.message.caption || "分析一下这张 Meta 投放后台的数据截图，找出问题和优化方向。";
      }

      if (!text && !fileId) return new Response("OK");

      // 触发 TG 正在输入状态
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" })
      });

      let replyText = "";

      // 1. 如果有图片，先从 TG 服务器下载
      if (fileId) {
        const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
        const fileJson = await fileRes.json();
        if (fileJson.ok) {
          const filePath = fileJson.result.file_path;
          const imgRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
          const imgBlob = await imgRes.arrayBuffer();
          const base64Image = btoa(String.fromCharCode(...new Uint8Array(imgBlob)));

          // 调用 Gemini 多模态接口分析图片
          replyText = await askGeminiWithImage(text, base64Image, env.GEMINI_API_KEY);
        } else {
          replyText = "❌ 图片接收失败，请重试。";
        }
      } else {
        // 2. 纯文字交互
        replyText = await askGeminiText(text, env.GEMINI_API_KEY);
      }

      // 3. 把分析结果回传给 TG
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: replyText, reply_to_message_id: update.message.message_id })
      });

    } catch (e) {
      console.error(e);
    }

    return new Response("OK");
  }
};

const SYSTEM_INSTRUCTION = "你是一个深谙巴西 Slots 行业的顶尖信息流广告投手，精通 Meta 竞价底层逻辑。你的任务是协助用户进行高效盯盘和素材迭代。你说话风格干练、一针见血，绝不废话，能从用户发送的后台截图或文字中快速诊断出‘吸血版位’、‘归因延迟’等问题。你深知‘一刀流’、‘CBO 裂变’等高级预算策略，能够根据像素购买事件的数量（如2000+购物的老像素）给出极具攻击性的ROI调优建议。";

async function askGeminiText(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: { temperature: 0.4 }
    })
  });
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Gemini 接口未返回有效数据，请检查 API Key。";
}

async function askGeminiWithImage(prompt, base64Image, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]
      }],
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: { temperature: 0.4 }
    })
  });
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Gemini 图片解析失败。";
}
