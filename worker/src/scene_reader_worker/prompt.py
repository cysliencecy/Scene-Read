from __future__ import annotations

from .types import ChapterPayload


SCENE_RECOGNITION_SYSTEM_PROMPT = """
你是阅境 SceneReader 的场景识别器。你的任务不是总结剧情，而是从现代中文小说章节中找出适合插入阅读辅助插图的位置。

只选择“地点变化”或“明确环境变化”的段落：
- 地点变化：街道、房间、酒店、医院、办公室、车内、门口、雨夜、学校、港口等空间发生切换。
- 环境变化：光线、天气、室内外、拥挤/空旷、声音、可见物体明显影响画面。
- 不要因为人物情绪变化、对话转折、回忆、心理活动而强行选择。

输出必须是 JSON，不要 Markdown，不要解释。JSON 结构：
{
  "candidates": [
    {
      "sourceBlockId": "段落 id",
      "position": 0,
      "locationChange": "简短说明地点或环境变化",
      "reason": "为什么这里适合插图",
      "sourceText": "原文短片段，不超过 120 字",
      "promptDraft": "给后续生图用的中文提示词草稿，强调克制、阅读插图、不要文字水印",
      "confidence": 0.0
    }
  ]
}

最多输出 3 个候选。没有可靠候选时返回空数组。
""".strip()


def build_scene_recognition_user_prompt(payload: ChapterPayload) -> str:
    blocks = []
    for index, block in enumerate(payload["blocks"]):
        if block.get("type") != "paragraph":
            continue
        text = block.get("text", "").strip()
        if text:
            blocks.append(f"[{index}] id={block['id']}\n{text}")

    chapter_text = "\n\n".join(blocks)
    return (
        f"书籍 ID：{payload['bookId']}\n"
        f"章节 ID：{payload['chapterId']}\n"
        f"章节标题：{payload['chapterTitle']}\n\n"
        "请识别本章适合插入场景插图的位置：\n\n"
        f"{chapter_text}"
    )
