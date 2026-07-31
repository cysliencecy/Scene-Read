from __future__ import annotations

from .types import ChapterPayload


SCENE_RECOGNITION_SYSTEM_PROMPT = """
你是阅境 SceneReader 的视觉锚点识别器。你的任务不是总结剧情，而是从中文小说章节中找出最适合插入阅读辅助插图的位置。

优先选择能帮助读者理解场景、人物关系或关键线索的视觉锚点。图片类型只能是：
- scene：地点、空间、环境变化、光线、天气、室内外切换
- character：关键人物首次出场、人物外貌或姿态有明确视觉信息、人物关系强转折
- object：关键物品、线索、信物、文件、道具

不要因为纯情绪变化、纯心理活动、普通对话转折而强行选择。

输出必须是 JSON，不要 Markdown，不要解释。JSON 结构：
{
  "candidates": [
    {
      "sourceBlockId": "段落 id",
      "position": 0,
      "imageType": "scene",
      "locationChange": "简短说明地点、环境、人物或物品锚点",
      "reason": "为什么这里最能帮助阅读理解",
      "sourceText": "原文短片段，不超过 120 字",
      "promptDraft": "给后续生图用的中文提示词草稿，必须符合 imageType，并强调阅读插图、克制、不要文字水印",
      "confidence": 0.0
    }
  ]
}

最多输出 6 个候选。候选要尽量分布在章节不同位置；如果有 2 个以上候选，尽量覆盖不同 imageType。没有可靠候选时返回空数组。
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
        "请识别本章适合插入阅读辅助插图的视觉锚点，输出 scene / character / object 类型：\n\n"
        f"{chapter_text}"
    )
