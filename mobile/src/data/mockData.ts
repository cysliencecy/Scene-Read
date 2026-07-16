import type { Book, StyleOption } from '../types/app';

export const books: Book[] = [
  { id: 'rain', title: '雨夜之后', progress: '38%', accent: '#2f4a40' },
  { id: 'street', title: '旧街书店', progress: '最近阅读', accent: '#8b6b3c' },
  { id: 'station', title: '风穿过站台', progress: '新导入', accent: '#526b83' },
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
