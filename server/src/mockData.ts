import type { Book, Chapter, GenerationTask, SceneCandidate, SceneImage } from './types.js';

export const books: Book[] = [
  {
    id: 'rain',
    title: '雨夜之后',
    progress: '38%',
    accent: '#2f4a40',
    currentChapterId: 'rain-chapter-1',
    lastReadLabel: '上次读到清晨街道，阅读到 38%',
  },
  {
    id: 'street',
    title: '旧街书店',
    progress: '最近阅读',
    accent: '#8b6b3c',
    currentChapterId: 'street-chapter-1',
    lastReadLabel: '上次读到旧书店门口',
  },
  {
    id: 'station',
    title: '风穿过站台',
    progress: '新导入',
    accent: '#526b83',
    currentChapterId: 'station-chapter-1',
    lastReadLabel: '准备开始第一章',
  },
];

export const chapters: Chapter[] = [
  {
    id: 'rain-chapter-1',
    bookId: 'rain',
    title: '第一章 雨夜之后',
    progress: 46,
    blocks: [
      {
        id: 'rain-p1',
        type: 'paragraph',
        text: '雨声在窗外持续了整夜。林知夏醒来时，手机屏幕上还停着昨晚没有发出去的消息。',
      },
      {
        id: 'rain-p2',
        type: 'paragraph',
        text: '她拿起外套，关上门，把身后的安静留在屋里。',
      },
      { id: 'rain-task-1-block', type: 'scene-placeholder', taskId: 'rain-task-1' },
      {
        id: 'rain-p3',
        type: 'paragraph',
        text: '街道被雨水洗得发亮，便利店的招牌还亮着。',
      },
      { id: 'rain-image-1-block', type: 'scene-image', imageId: 'rain-image-1' },
    ],
  },
  {
    id: 'street-chapter-1',
    bookId: 'street',
    title: '第一章 旧街书店',
    progress: 18,
    blocks: [
      {
        id: 'street-p1',
        type: 'paragraph',
        text: '旧街尽头的书店还亮着灯。木门被雨水泡得发暗，门铃在她推开时响了一声。',
      },
      { id: 'street-image-1-block', type: 'scene-image', imageId: 'street-image-1' },
    ],
  },
  {
    id: 'station-chapter-1',
    bookId: 'station',
    title: '第一章 风穿过站台',
    progress: 5,
    blocks: [
      {
        id: 'station-p1',
        type: 'paragraph',
        text: '站台上风很大，广播声被吹得断断续续。',
      },
      { id: 'station-task-1-block', type: 'scene-placeholder', taskId: 'station-task-1' },
    ],
  },
];

export const generationTasks: GenerationTask[] = [
  {
    id: 'rain-task-1',
    chapterId: 'rain-chapter-1',
    progress: 68,
    status: 'generating',
    label: '正在生成这段地点变化的插图',
  },
  {
    id: 'station-task-1',
    chapterId: 'station-chapter-1',
    progress: 42,
    status: 'generating',
    label: '正在生成站台场景图',
  },
];

export const sceneImages: SceneImage[] = [
  {
    id: 'rain-image-1',
    chapterId: 'rain-chapter-1',
    imageType: 'scene',
    effectiveImageType: 'environment',
    variant: 'street',
    prompt: '雨后清晨街道，便利店灯光，湿润路面，安静现实主义风格',
  },
  {
    id: 'street-image-1',
    chapterId: 'street-chapter-1',
    imageType: 'object',
    effectiveImageType: 'object',
    variant: 'office',
    prompt: '旧街书店室内，雨夜木门，旧书箱，温暖灯光',
  },
];

/** Existing persisted rows used only to exercise non-destructive compatibility reads in mock mode. */
export const legacySceneCandidates: SceneCandidate[] = [
  {
    id: 'legacy-scene-e2e', taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
    order: 20, sourceBlockId: 'rain-p-1', position: 20, reason: 'Legacy scene',
    sourceText: 'Legacy source.', promptDraft: 'Legacy prompt.', imageType: 'scene',
    effectiveImageType: 'environment', confidence: 0.8,
  },
  {
    id: 'legacy-object-e2e', taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
    order: 21, sourceBlockId: 'rain-p-1', position: 21, reason: 'Legacy object',
    sourceText: 'Legacy source.', promptDraft: 'Legacy prompt.', imageType: 'object',
    effectiveImageType: 'object', confidence: 0.8,
  },
  {
    id: 'legacy-character-e2e', taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
    order: 22, sourceBlockId: 'rain-p-1', position: 22, reason: 'Legacy character',
    sourceText: 'A figure waits in the rain.', promptDraft: 'Legacy prompt.', imageType: 'character',
    effectiveImageType: null, confidence: 0.8,
  },
];
