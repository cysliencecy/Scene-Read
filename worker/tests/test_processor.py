import unittest

from scene_reader_worker.processor import process_chapter


class ProcessorTest(unittest.TestCase):
    def test_process_chapter_outputs_scene_candidates(self) -> None:
        result = process_chapter(
            {
                "taskId": "task-1",
                "bookId": "book-1",
                "chapterId": "chapter-1",
                "chapterTitle": "第一章",
                "blocks": [
                    {"id": "p1", "type": "paragraph", "text": "夜里，街道上的风很冷。"},
                    {"id": "p2", "type": "paragraph", "text": "她低头看着手机。"},
                ],
            }
        )

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.candidates[0].chapterId, "chapter-1")
        self.assertEqual(result.candidates[0].sourceBlockId, "p1")


if __name__ == "__main__":
    unittest.main()
