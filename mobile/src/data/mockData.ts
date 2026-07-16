import type { Book, Chapter, GenerationTask, SceneImage, StyleOption } from '../types/app';

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
  },
  {
    id: 'rain-image-2',
    chapterId: 'rain-chapter-1',
    variant: 'office',
    prompt: '现代公司前台与走廊，清晨冷色光线，安静压迫感',
  },
  {
    id: 'street-image-1',
    chapterId: 'street-chapter-1',
    variant: 'office',
    prompt: '旧街书店室内，雨夜木门，旧书箱，温暖灯光',
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
