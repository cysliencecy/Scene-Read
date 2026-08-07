import type { Book, Chapter, GenerationTask, SceneCandidateDebugDetail, SceneImage, StyleOption } from '../types/app';

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
        text: '客厅里只剩下一盏落地灯，沙发边的杯子已经凉透。她在玄关站了很久，直到楼下传来第一班公交车的声音。',
      },
      {
        id: 'rain-p3',
        type: 'paragraph',
        text: '她拿起外套，关上门，把身后的安静留在屋里。',
      },
      { id: 'rain-task-1-block', type: 'scene-placeholder', taskId: 'rain-task-1' },
      {
        id: 'rain-p4',
        type: 'paragraph',
        text: '街道被雨水洗得发亮，便利店的招牌还亮着。她沿着人行道往地铁站走，耳机里没有音乐。',
      },
      {
        id: 'rain-p5',
        type: 'paragraph',
        text: '只有雨滴从树叶上落下来的声音，一下，又一下。',
      },
      { id: 'rain-image-1-block', type: 'scene-image', imageId: 'rain-image-1' },
      {
        id: 'rain-p6',
        type: 'paragraph',
        text: '九点差五分，她推开公司玻璃门。前台的灯刚刚打开，走廊尽头的会议室已经坐了几个人。',
      },
      {
        id: 'rain-p7',
        type: 'paragraph',
        text: '空气里有咖啡和打印纸混在一起的味道。',
      },
      { id: 'rain-image-2-block', type: 'scene-image', imageId: 'rain-image-2' },
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
      {
        id: 'street-p2',
        type: 'paragraph',
        text: '店里没有客人，只有靠窗的位置堆着几箱还没拆封的旧书。',
      },
      { id: 'street-image-1-block', type: 'scene-image', imageId: 'street-image-1' },
      {
        id: 'street-p3',
        type: 'paragraph',
        text: '她沿着书架往里走，指尖擦过一排泛黄的书脊，像是在确认某段时间仍然存在。',
      },
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
        text: '站台上风很大，广播声被吹得断断续续。她把车票攥在手里，望着远处缓慢亮起的车灯。',
      },
      {
        id: 'station-p2',
        type: 'paragraph',
        text: '人群向前挪动时，她忽然想起自己已经很久没有回过这座城市。',
      },
      { id: 'station-task-1-block', type: 'scene-placeholder', taskId: 'station-task-1' },
    ],
  },
  {
    id: 'island-chapter-1',
    bookId: 'island',
    title: '第一章 海风里的信',
    progress: 0,
    blocks: [
      {
        id: 'island-p1',
        type: 'paragraph',
        text: '船靠岸时，天色刚刚亮。港口的雾还没有散，远处的灯塔像一枚安静的钉子，钉在灰蓝色的海面上。',
      },
      {
        id: 'island-p2',
        type: 'paragraph',
        text: '她把那封没有署名的信放进口袋，沿着石阶往镇上走去。街边的窗户一扇接一扇打开，潮湿的风从巷子里穿过。',
      },
      { id: 'island-task-1-block', type: 'scene-placeholder', taskId: 'island-task-1' },
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
  {
    id: 'island-task-1',
    chapterId: 'island-chapter-1',
    progress: 24,
    status: 'generating',
    label: '正在生成港口到小镇的场景图',
  },
];

export const sceneImages: SceneImage[] = [
  {
    id: 'rain-image-1',
    chapterId: 'rain-chapter-1',
    variant: 'street',
    prompt: '雨后清晨街道，便利店灯光，湿润路面，安静现实主义风格',
    imageUrl: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'rain-image-2',
    chapterId: 'rain-chapter-1',
    variant: 'office',
    prompt: '现代公司前台与走廊，清晨冷色光线，安静压迫感',
    imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'street-image-1',
    chapterId: 'street-chapter-1',
    variant: 'office',
    prompt: '旧街书店室内，雨夜木门，旧书箱，温暖灯光',
    imageUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80',
  },
];

const classificationBase = {
  evidence: [{ sourceBlockId: 'rain-p4', sourceText: 'The wet street reflected the convenience-store sign.' }],
  reason: 'The setting anchors the next movement in the chapter.',
  auxiliaryTags: ['rain', 'night'],
  model: 'kimi-k3',
  promptVersion: 'classification-v2',
};

export const sceneCandidateDebugDetails: SceneCandidateDebugDetail[] = [
  {
    id: 'mock-candidate-eligible', taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
    order: 0, sourceBlockId: 'rain-p4', position: 3, reason: classificationBase.reason,
    sourceText: classificationBase.evidence[0].sourceText, promptDraft: 'A rainy street in landscape 3:2.',
    confidence: 0.86, imageType: 'environment', storedImageType: 'environment', effectiveImageType: 'environment',
    classification: {
      ...classificationBase, primaryType: 'environment', status: 'eligible',
      rankedTypes: [
        { imageType: 'environment', confidence: 0.86 },
        { imageType: 'atmosphere', confidence: 0.71 },
        { imageType: 'object', confidence: 0.22 },
      ],
    },
    contractVersion: 'composition-v1', profileVersion: 'profile-v3',
    attempts: [{
      id: 'mock-attempt-eligible', idempotencyKey: 'mock-auto-1', candidateId: 'mock-candidate-eligible',
      taskId: 'rain-task-1', trigger: 'automatic', requestedType: 'environment', status: 'publishable',
      prompt: 'A rainy street in landscape 3:2.', provider: 'glm', model: 'glm-image-1', width: 1536, height: 1024,
      imageUrl: sceneImages[0].imageUrl, createdAt: '2026-08-07T09:00:00.000Z',
      audit: { verdict: 'publishable', rules: [], severeFactConflict: false, provider: 'vision', model: 'vision-v1', auditVersion: 'audit-v1' },
    }],
  },
  {
    id: 'mock-candidate-below', taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
    order: 1, sourceBlockId: 'rain-p2', position: 1, reason: 'The moment could be a portrait or atmosphere image.',
    sourceText: 'She stood in the entrance while the room stayed quiet.', promptDraft: 'Quiet apartment entrance.',
    confidence: 0.61, imageType: 'portrait', storedImageType: 'portrait', effectiveImageType: 'portrait',
    classification: {
      ...classificationBase, primaryType: 'portrait', status: 'below_threshold', reason: 'The moment could be a portrait or atmosphere image.',
      rankedTypes: [
        { imageType: 'portrait', confidence: 0.61 },
        { imageType: 'atmosphere', confidence: 0.58 },
        { imageType: 'environment', confidence: 0.43 },
      ],
    },
    contractVersion: 'composition-v1', profileVersion: 'profile-v3', attempts: [],
  },
  {
    id: 'mock-candidate-blocked', taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
    order: 2, sourceBlockId: 'rain-p6', position: 5, reason: 'The meeting is an interaction.',
    sourceText: 'Several people were already seated in the meeting room.', promptDraft: 'Office meeting interaction.',
    confidence: 0.79, imageType: 'interaction', storedImageType: 'interaction', effectiveImageType: 'interaction',
    classification: {
      ...classificationBase, primaryType: 'interaction', status: 'eligible', reason: 'The meeting is an interaction.',
      rankedTypes: [
        { imageType: 'interaction', confidence: 0.79 },
        { imageType: 'environment', confidence: 0.44 },
        { imageType: 'portrait', confidence: 0.31 },
      ],
    },
    contractVersion: 'composition-v1', profileVersion: 'profile-v3',
    attempts: [{
      id: 'mock-attempt-blocked', idempotencyKey: 'mock-auto-2', candidateId: 'mock-candidate-blocked',
      taskId: 'rain-task-1', trigger: 'automatic', requestedType: 'interaction', status: 'blocked',
      prompt: 'Office meeting interaction.', provider: 'glm', model: 'glm-image-1', width: 1536, height: 1024,
      imageUrl: sceneImages[1].imageUrl, createdAt: '2026-08-07T09:10:00.000Z',
      audit: {
        verdict: 'blocked', severeFactConflict: true, provider: 'vision', model: 'vision-v1', auditVersion: 'audit-v1',
        rules: [{ rule: 'stable-facts', passed: false, severity: 'severe', explanation: 'A stable character fact conflicts with the image.' }],
      },
    }],
  },
  {
    id: 'mock-candidate-manual', taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
    order: 3, sourceBlockId: 'rain-p1', position: 0, reason: 'The phone is the visual focus.',
    sourceText: 'The unsent message remained on the phone screen.', promptDraft: 'Close view of the phone.',
    confidence: 0.74, imageType: 'object', storedImageType: 'object', effectiveImageType: 'object',
    classification: {
      ...classificationBase, primaryType: 'object', status: 'eligible', reason: 'The phone is the visual focus.',
      rankedTypes: [
        { imageType: 'object', confidence: 0.74 },
        { imageType: 'portrait', confidence: 0.51 },
        { imageType: 'atmosphere', confidence: 0.35 },
      ],
    },
    contractVersion: 'composition-v1', profileVersion: 'profile-v3',
    attempts: [
      {
        id: 'mock-attempt-original', idempotencyKey: 'mock-auto-3', candidateId: 'mock-candidate-manual',
        taskId: 'rain-task-1', trigger: 'automatic', requestedType: 'object', status: 'publishable',
        prompt: 'Close view of the phone.', imageUrl: sceneImages[0].imageUrl, createdAt: '2026-08-07T08:00:00.000Z',
      },
      {
        id: 'mock-attempt-manual', idempotencyKey: 'mock-manual-1', candidateId: 'mock-candidate-manual',
        taskId: 'rain-task-manual', parentAttemptId: 'mock-attempt-original', trigger: 'manual', requestedType: 'atmosphere',
        overriddenFrom: 'object', status: 'publishable', prompt: 'Rainy room atmosphere around the phone.',
        imageUrl: sceneImages[1].imageUrl, createdAt: '2026-08-07T10:00:00.000Z',
      },
    ],
  },
];

export const styleOptions: StyleOption[] = [
  {
    name: '写实',
    description: '适合都市、悬疑、现实题材，画面克制。',
    colors: ['#253631', '#c6b894'],
  },
  {
    name: '动漫',
    description: '适合轻小说和青春题材，角色感更强。',
    colors: ['#384a70', '#d8a7a1'],
  },
  {
    name: '插画',
    description: '适合温和叙事，保留文字阅读的安静感。',
    colors: ['#56624d', '#d8c58e'],
  },
];

export function findBook(bookId: string) {
  return books.find((book) => book.id === bookId) ?? books[0];
}

export function findChapter(chapterId: string) {
  return chapters.find((chapter) => chapter.id === chapterId) ?? chapters[0];
}

export function findTask(taskId: string) {
  return generationTasks.find((task) => task.id === taskId);
}

export function findSceneImage(imageId: string) {
  return sceneImages.find((image) => image.id === imageId);
}
